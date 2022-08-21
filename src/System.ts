import {v4 as uuidv4} from 'uuid';
import MessageBus from './utilities/MessageBus';
import HttpServer from './utilities/HttpServer';
import PendingRequestRepository from './repositories/PendingRequestRepository';
import ServiceRepository from './repositories/ServiceRepository';
import RestProxy from './utilities/RestProxy';
import { pluck, sleep } from './utilities/helpers';


/**
 * System class that manages everything
 */

export default class System
{
    private _requestTimeoutLimit: number;
    private _messageBus: MessageBus;
    private _restServer: HttpServer;
    private _restProxy: RestProxy;
    private _pendingRequests: PendingRequestRepository;
    private _services: ServiceRepository;

    constructor()
    {
        // load configurations
        this._requestTimeoutLimit = parseInt(process.env.REQUEST_TIMEOUT);

        this._messageBus = new MessageBus(process.env.CLIENT_ID, process.env.GROUP_ID, [process.env.KAFKA_BOOTSTRAP_SERVER]);
        this._restServer = new HttpServer();
        this._restProxy = new RestProxy();
        this._pendingRequests = new PendingRequestRepository();
        this._services = new ServiceRepository();
    }

    /**
     * Start the system
     * 
     * - start connection to message bus
     * - start client connections to all exchanges
     */
    public async start(): Promise<boolean>
    {
        const context = this;

        console.log('System: starting...');

        return new Promise(async (resolve, reject) => {
            try {
                /**
                 * When connected to message bus
                 * - register service with service registry
                 */
                context._messageBus.onConnect(async () => {
                    console.log('System: connected to message bus');
            
                    /**
                     * Register with the service registry
                     */
                    context._messageBus.sendEvent('service-registry', 'SERVICE_ONLINE', {
                        instanceId: process.env.INSTANCE_ID,
                        serviceId:  process.env.SERVICE_ID,
                        supportedCommunicationChannels: ['bus'],
                        hostname: 'gateway-proxy',
                        port: 8000,
                        endpoints: [],
                        commands:  []
                    });

                    // setup mapping endpoints to inbound event channel repository
                    context._messageBus.sendQuery('service-registry', 'SERVICE_LIST', {});
                });

                /**
                 * When changes are made to services (on message bus)
                 */
                context._messageBus.onMessage('service-registry', async (message) => {
                    // service came online
                    if(message.messageType == 'EVENT' && message.eventId == 'SERVICE_ONLINE') {

                        // update route mapping repository
                        const updated = context._services.update(message.serviceId, message.serviceId, message.supportedCommunicationChannels, message.hostname, message.port, message.endpoints, message.commands, message.instances);
                        if(updated && message.serviceId != process.env.SERVICE_ID) {
                            console.log('System: service online ' + message.serviceId + ' (instance ' + message.instanceId + ')');

                            if(!message.supportedCommunicationChannels || !message.supportedCommunicationChannels.includes('bus')) {
                                return;
                            }

                            context._messageBus.subscribeToTopic(message.serviceId);
                            context._messageBus.onMessage(message.serviceId, (serviceMessage) => context.onMessagesFromServices(serviceMessage));
                        }
                    }
                    // service went offline
                    else if(message.messageType == 'EVENT' && message.eventId == 'SERVICE_OFFLINE') {
                        // update route mapping repository
                        const removed = context._services.remove(message.serviceId);
                        if(removed && message.serviceId != process.env.SERVICE_ID) {
                            console.log('System: service offline ' + message.serviceId + ' (instance ' + message.instanceId + ')');

                            context._messageBus.unsubscribeFromTopic(message.serviceId);
                        }
                    }
                    // entire service list
                    else if(message.messageType == 'RESPONSE' && message.queryId == 'SERVICE_LIST') {
                        if(typeof message.response === 'undefined') {
                            return;
                        }

                        console.log('System: ' + message.response.length + ' services found');
                    
                        for(let sI in message.response) {
                            const service = message.response[sI];
                    
                            const updated = context._services.update(service.id, service.name, service.supportedCommunicationChannels, service.hostname, service.port, service.endpoints, service.commands, service.instances);
                            if(updated && service.name != process.env.SERVICE_ID) {
                                console.log('System: service updated ' + service.name + ' (' + service.instances.length + ' instances)');

                                if(!service.supportedCommunicationChannels || !service.supportedCommunicationChannels.includes('bus')) {
                                    return;
                                }

                                context._messageBus.subscribeToTopic(service.name);
                                context._messageBus.onMessage(service.name, (serviceMessage) => context.onMessagesFromServices(serviceMessage));
                            }
                        }
                    }
                });

                /**
                 * When a request is sent to the rest server
                 */
                context._restServer.onRequest(async ({req, res, next}) => {
                    try {
                        const method = req.method.toLowerCase();
                        const url = req.path;

                        // string to identify a route
                        const routeId = method + '-' + url;

                        // string to identify the current request
                        const requestId = routeId + '.' + uuidv4();

                        // check for a mapping in mapping repository
                        const service = context._services.getByRequest(method, url);
                        if(!service) {
                            return next();
                        }

                        console.log('System: service found ', service.name);

                        // check if request should be authenticated based on mapping schema
                        // authenticate request using given pattern

                        // start the timeout response timer (if no service responds)
                        let requestTimeout = setTimeout(() => {
                            clearTimeout(requestTimeout);
                            requestTimeout = null;

                            const pendingRequest = context._pendingRequests.get(requestId);
                            if(pendingRequest && pendingRequest.sent) {
                                return;
                            }

                            context._pendingRequests.updateSent(requestId, true);

                            return res.status(504).json({
                                message: 'Timed out'
                            });
                        }, context._requestTimeoutLimit); // 30 seconds

                        // send http request or message bus message
                        if(service.supportedCommunicationChannels.includes('bus')) {

                            // add to pending requests repository
                            const pendingRequestAdded = context._pendingRequests.add(requestId, {
                                request: req,
                                requestTimeout,
                                responseCallback: res,
                                sent: false
                            });

                            if(pendingRequestAdded) {
                                context._messageBus.sendRequest(service.name, routeId, requestId, {
                                    gatewayId: process.env.INSTANCE_ID,
                                    method,
                                    endpoint: url,
                                    data: req.body
                                });
                            }
                        }
                        else if(service.supportedCommunicationChannels.includes('rest')) {
                            const requestHeaders = pluck(['content-type', 'user-agent', 'x-auth-token', 'st-api-key', 'st-api-sign', 'st-api-timestamp'], req.headers);
                            const requestBody = req.body ? req.body : null;

                            const requestUrl = 'http://' + service.hostname + ':' + service.port + url;

                            // add to pending requests repository
                            const pendingRequestAdded = context._pendingRequests.add(requestId, {
                                request: req,
                                requestTimeout,
                                responseCallback: res,
                                sent: false
                            });

                            if(pendingRequestAdded) {
                                console.log('System: sending request to ' + requestUrl);

                                //TODO: on main request timeout, cancel proxied request
                                context._restProxy.sendRequest(method, requestUrl, requestBody, requestHeaders).then((proxiedRes) => {
                                    // check if a response has already been sent for the pending request
                                    const pendingRequest = context._pendingRequests.get(requestId);
                                    if(pendingRequest.sent) {
                                        return;
                                    }

                                    // clear the timeout for the current incoming request
                                    clearTimeout(requestTimeout);
                                    requestTimeout = null;

                                    // greater than 300 (redirects and server errors)
                                    if(!proxiedRes) {
                                        context._pendingRequests.updateSent(requestId, true);

                                        return next();
                                    }

                                    context._pendingRequests.updateSent(requestId, true);

                                    return res.status(proxiedRes.statusCode).json(proxiedRes.body); 
                                }).catch((err) => {
                                    console.log(err);

                                    return;
                                });  
                            }
                        }
                    }
                    catch(e) {
                        console.log(e);

                        return res.status(500).json({
                            message: 'Unknown server error'
                        });
                    }
                });

                /**
                 * Connect to message bus
                 */
                if(process.env.MESSAGE_BUS !== 'false') {
                    console.log('System: connecting to message bus...');
                    context._messageBus.connect();
                }

                /**
                 * Start http/rest server
                 */
                if(process.env.REST_SERVER !== 'false') {
                    console.log('System: starting http server');
                    context._restServer.start(process.env.REST_PORT);
                }

                resolve(true);
            }
            catch(err) {
                console.log('System error: ', err);
                
                console.log('System: wait 10 seconds before reconnecting...');
                await sleep(10 * 1000);

                console.log('System: reconnecting to message bus...');
                context._messageBus.disconnect();
                context._messageBus.connect();

                console.log('System: starting http server...');
                context._restServer.stop();
                context._restServer.start(process.env.REST_PORT);

                resolve(false);
            }
        });
    }

    /**
     * Stop the system
     *
     * - let service registry know service is going offline
     * - disconnect from the message bus
     */
    public async stop()
    {
        const context = this;

        try {
            if(process.env.MESSAGE_BUS !== 'false') {
                // let the service registry know that a micro-service is offline
                console.log('System: updating service registry (SERVICE_OFFLINE)...');
                await context._messageBus.sendEvent('service-registry', 'SERVICE_OFFLINE', {
                    instanceId: process.env.INSTANCE_ID,
                    serviceId:  process.env.SERVICE_ID
                });
                console.log('System: service registry updated');
            }

            if(process.env.MESSAGE_BUS !== 'false') {
                console.log('System: stopping http server...');
                await context._restServer.stop();
                console.log('System: http server stopped');
            }

            if(process.env.MESSAGE_BUS !== 'false') {
                console.log('System: disconnecting from message bus...');
                await context._messageBus.disconnect();
                console.log('System: message bus disconnected');
            }
        }
        catch (ex) {
            console.log('System error: ', ex);
            return;
        }
    }

    /**
     * When messages are received from services on the message bus
     */
    public onMessagesFromServices(message)
    {
        const context = this;

        // when a micro-service creates a response message
        try {
            if(message.messageType != 'RESPONSE') {
                return;
            }

            // get pending request by generated request id
            const pendingRequest = context._pendingRequests.get(message.requestId);
            if(!pendingRequest || pendingRequest.sent) {
                return;
            }

            // clear timeout
            clearTimeout(pendingRequest.requestTimeout);

            // get response object from pending request
            const res = pendingRequest.responseCallback;

            // remove pending request
            context._pendingRequests.remove(message.requestId);

            // send the response
            return res.status(message.responseCode || 400).json(message.response || {});
        }
        catch(ex)
        {
            console.log('System error: ', ex);
            return;
        }
    }
}