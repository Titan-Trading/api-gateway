


// get route registry data 

// set up middleware for converting rest requests to message sagas
    // listens on message queue for responses
    // send 404 when there's no mapping found
    // manage time-outs
    // manage authentication (jwt and api key)

// listens on message queue for route registry updates

require('dotenv').config();

import {v4 as uuidv4} from 'uuid';

import MessageBus from './bus/MessageBus';
import HttpServer from './HttpServer';
import PendingRequestRepository from './repositories/PendingRequestRepository';
import ServiceRepository from './repositories/ServiceRepository';
import RestProxy from './RestProxy';
import { pluck } from './helpers';

const messageBus = new MessageBus(process.env.CLIENT_ID, process.env.GROUP_ID, [process.env.KAFKA_BOOTSTRAP_SERVER]);
const restServer = new HttpServer();
const restProxy = new RestProxy();
const pendingRequests = new PendingRequestRepository();
const services = new ServiceRepository();

// service id and instance id
const serviceId = process.env.SERVICE_ID;
const instanceId = process.env.INSTANCE_ID;
const serviceRegistryTopic = 'service-registry';
let requestTimeoutLimit: number = parseInt(process.env.REQUEST_TIMEOUT);

// when a micro-service creates a response message
function servicesOutboundCallback(data) {
    try {
        if(data.messageType != 'RESPONSE') {
            return;
        }

        // get pending request by generated request id
        const pendingRequest = pendingRequests.get(data.requestId);
        if(!pendingRequest) {
            return;
        }

        // clear timeout
        clearTimeout(pendingRequest.requestTimeout);

        // get response object from pending request
        const res = pendingRequest.responseCallback;

        // remove pending request
        pendingRequests.remove(data.requestId);

        // send the response
        return res.status(data.responseCode || 400).json(data.response || {});
    }
    catch(ex)
    {
        console.log(ex);
    }
}

// when service registry is has responses
messageBus.onMessage(serviceRegistryTopic, async (data) => {
    // service came online
    if(data.messageType == 'EVENT' && data.eventId == 'SERVICE_ONLINE') {
        console.log('service online: ' + data.serviceId + ' (' + data.instanceId + ')');

        // update route mapping repository
        const updated = services.update(data.serviceId, data.serviceId, data.supportedCommunicationChannels, data.hostname, data.port, data.endpoints, data.commands, data.instances);
        if(updated && data.serviceId != serviceId) {
            if(!data.supportedCommunicationChannels || !data.supportedCommunicationChannels.includes('bus')) {
                return;
            }

            await messageBus.subscribeToTopic(data.serviceId);

            await messageBus.onMessage(data.serviceId, servicesOutboundCallback);
        }
    }
    // service went offline
    else if(data.messageType == 'EVENT' && data.eventId == 'SERVICE_OFFLINE') {
        console.log('service offline: ' + data.serviceId + ' (' + data.instanceId + ')');

        // update route mapping repository
        const removed = services.remove(data.serviceId);
        if(removed) {
            await messageBus.unsubscribeFromTopic(data.serviceId);
        }
    }
    // entire service list
    else if(data.messageType == 'RESPONSE' && data.queryId == 'SERVICE_LIST') {
        if(typeof data.response === 'undefined') {
            return;
        }
    
        for(let sI in data.response) {
            const service = data.response[sI];
    
            const updated = services.update(service.id, service.name, service.supportedCommunicationChannels, service.hostname, service.port, service.endpoints, service.commands, service.instances);
            if(updated && service.name != serviceId) {
                if(!service.supportedCommunicationChannels || !service.supportedCommunicationChannels.includes('bus')) {
                    return;
                }

                console.log('service updated: ' + data.serviceId);

                await messageBus.subscribeToTopic(service.name);
    
                await messageBus.onMessage(service.name, servicesOutboundCallback);
            }
        }
    }
});

// connect to message bus
messageBus.connect().then(async () => {
    console.log('connected to message bus');

    // let the service registry know that a new micro-service is online
    await messageBus.sendEvent(serviceRegistryTopic, 'SERVICE_ONLINE', {
        instanceId,
        serviceId,
        supportedCommunicationChannels: ['bus'],
        hostname: 'gateway-proxy',
        port: 80,
        endpoints: [],
        commands: []
    });

    // setup mapping endpoints to inbound event channel repository
    await messageBus.sendQuery(serviceRegistryTopic, 'SERVICE_LIST', {});
});

// when a request is sent to the HTTP server
restServer.onRequest(async (req, res) => {
    try {
        const method = req.method.toLowerCase();
        const url = req.path;

        // string to identify a route
        const routeId = method + '-' + url;

        // string to identify the current request
        const requestId = routeId + '.' + uuidv4();

        // check for a mapping in mapping repository
        const service = services.getByRequest(method, url);
        if(!service) {
            return res.status(404).json({
                message: 'Not found'
            });
        }

        console.log('Service found:', service.name);

        // check if request should be authenticated based on mapping schema
        // authenticate request using given pattern

        // start the timeout response timer (if no service responds)
        let requestTimeout = setTimeout(() => {
            clearTimeout(requestTimeout);
            requestTimeout = null;

            return res.status(504).json({
                message: 'Timed out'
            });
        }, requestTimeoutLimit); // 30 seconds

        // send http request or message bus message
        if(service.supportedCommunicationChannels.includes('bus')) {

            // add to pending requests repository
            const pendingRequestAdded = pendingRequests.add(requestId, {
                request: req,
                requestTimeout,
                responseCallback: res
            });

            if(pendingRequestAdded) {
                await messageBus.sendRequest(service.name, routeId, requestId, {
                    gatewayId: instanceId,
                    method,
                    endpoint: url,
                    data: req.body
                });
            }
        }
        else if(service.supportedCommunicationChannels.includes('rest')) {
            const requestHeaders = pluck(['content-type', 'user-agent', 'x-auth-token', 'st-api-key', 'st-api-signature', 'st-api-timestamp'], req.headers);
            const requestBody = req.body ? req.body : null;

            //TODO: on main request timeout, cancel proxied request
            const proxiedRes = await restProxy.sendRequest(method, 'http://' + service.hostname + ':' + service.port + url, requestBody, requestHeaders);

            // clear the timeout for the current incoming request
            clearTimeout(requestTimeout);
            requestTimeout = null;

            // greater than 300 (redirects and server errors)
            if(!proxiedRes) {
                return res.status(404).json({
                    message: 'Not found'
                });
            }

            return res.status(proxiedRes.statusCode).json(proxiedRes.body);
        }
    }
    catch(e) {
        console.log(e);

        return res.status(500).json({
            message: 'Unknown server error'
        });
    }
});

// start http/rest service
restServer.start(process.env.REST_PORT);

/**
 * Closed on error/generic
 */
 process.on('SIGTERM', async () => {
    console.info('SIGTERM signal received.');

    // let the service registry know that a micro-service is offline
    await messageBus.sendEvent(serviceRegistryTopic, 'SERVICE_OFFLINE', {
        instanceId,
        serviceId
    });

    await messageBus.disconnect();

    console.log('message for service going offline sent');

    process.exit(0);
});

/**
 * Closed with keypress ctrl+c
 */
process.on('SIGINT', async () => {
    console.info('SIGINT signal received.');

    // let the service registry know that a micro-service is offline
    await messageBus.sendEvent(serviceRegistryTopic, 'SERVICE_OFFLINE', {
        instanceId,
        serviceId
    });

    await messageBus.disconnect();

    console.log('message for service going offline sent');

    process.exit(0);
});
