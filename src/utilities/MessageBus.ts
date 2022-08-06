import { Kafka } from 'kafkajs';
import PubSub from './PubSub';
import {v4 as uuidv4} from 'uuid';

export default class MessageBus
{
    kafka = null;
    consumerGroupId = null;
    topics = [];
    consumer = null;
    producer = null;
    producerIsConnected = false;
    pubsub = null;

    constructor(clientId, consumerGroupId, brokers = [])
    {
        this.kafka = new Kafka({
            clientId,
            brokers,
            connectionTimeout: 30000,
            enforceRequestTimeout: false,
            retry: {
                initialRetryTime: 10000,
                retries: 10,
            }
        });

        this.consumerGroupId = consumerGroupId;

        // setup pub-sub class
        this.pubsub = new PubSub();

        // setup kafka consumer
        this.consumer = this.kafka.consumer({
            groupId: this.consumerGroupId,
            retry: {
                restartOnFailure: function (err) {
                    return new Promise((resolve, reject) => {
                        resolve(true);
                    });
                }
            }
        });

        this.consumer.on('consumer.crash', (event) => {
            console.log('crash detected, restart');
            console.log(event);
            this.consumer.disconnect();
            this.consumer.connect();
        });

        // setup kafka producer
        this.producer = this.kafka.producer({});
    }

    /**
     * Connect a client type to the message bus (producer or consumer)
     * @param clientType 
     */
    async connect(clientType: string = null)
    {
        let context = this;

        try {
            // connect the client type
            await this[clientType || 'consumer'].connect();

            if(!clientType) {
                await this['producer'].connect();
                this.producerIsConnected = true;
            }
            else if(clientType == 'producer') {
                this.pubsub.emit('producerOnConnect', {});
            }

            // client type is consumer
            if(!clientType || clientType === 'consumer') {
                // subscribe to all topics from the config
                const topicsConfig = process.env.TOPICS.split(',');
                this.topics = this.topics.length ? this.topics : topicsConfig;
                for(var iT in this.topics) {
                    const topic = this.topics[iT];
                    await this.consumer.subscribe({
                        topic
                    });
                }

                // setup a callback for messages that are consumed
                await this.consumer.run({
                    eachMessage: async ({ topic, partition, message }) => {
                        try {
                            const messageKey = message.key ? Buffer.from(message.key).toString() : null;
                            const messageData = message.value ? JSON.parse(Buffer.from(message.value).toString()) : null;

                            // console.log('Channel: ' + topic);
                            // console.log('Partition: ' + partition);
                            // console.log('Message ID: ' + messageKey);
                            // console.log('Message body: ', messageData);

                            context.pubsub.emit(topic, messageData);
                        }
                        catch(ex) {
                            console.error(ex);
                        }
                    }
                });

                if(clientType === 'consumer') {
                    this.pubsub.emit('consumerOnConnect', {});
                }
                else {
                    this.pubsub.emit('onConnect', {});
                }
            }
        }
        catch(ex) {
            console.log('crash detected, restart');
            console.log(ex);

            context.disconnect();
            context.connect();
        }
    }

    /**
     * Disconnect a client type from the message bus (producer or consumer)
     * @param clientType 
     */
    async disconnect(clientType: string = null)
    {
        if(clientType) {
            await this[clientType].disconnect();

            if(clientType === 'producer') {
               this.producerIsConnected = false; 
            }
            
            this.pubsub.emit(clientType + 'OnDisconnect', {});
        }
        else {
            await this.producer.disconnect();
            this.producerIsConnected = false;

            await this.consumer.disconnect();
        }
    }

    /**
     * Unsubscribe consumer client to topic
     * @param topic 
     * @returns 
     */
    async subscribeToTopic(topic)
    {
        if(this.topics.includes(topic)) {
            return false;
        }

        await this.disconnect();

        this.topics.push(topic);

        await this.connect();

        return true;
    }

    /**
     * Unsubscribe consumer client from topic
     * @param topic 
     * @returns 
     */
    async unsubscribeFromTopic(topic)
    {
        if(!this.topics.includes(topic)) {
            return false;
        }

        this.pubsub.off(topic);

        await this.disconnect();

        const topicIndex = this.topics.indexOf(topic);
        delete this.topics[topicIndex];

        await this.connect();

        return true;
    }

    /**
     * Send a given message (raw message or any type) using the producer client on a given topic
     * @param topic 
     * @param data 
     * @returns 
     */
    sendMessage(topic, data)
    {
        if(!this.producerIsConnected) {
            return false;
        }

        data.topic = topic;
        data.messageId = uuidv4();

        return this.producer.send({
            topic,
            messages: [
                {
                    key: data.messageId,
                    value: JSON.stringify(data)
                }
            ]
        });
    }

    /**
     * Send a command message (telling a service(s) to do something immediately) using the producer client on a given channel/topic
     * @param channel 
     * @param commandId 
     * @param commandParameters 
     * @returns 
     */
    sendCommand(channel, commandId, commandParameters)
    {
        commandParameters.messageType = 'COMMAND';
        commandParameters.commandId = commandId;

        return this.sendMessage(channel, commandParameters);
    }

    /**
     * Send a query message (asking for some information immediately, ex: api get request routing) using the producer client on a given channel/topic
     * @param channel 
     * @param queryId 
     * @param queryParameters 
     * @returns 
     */
    sendQuery(channel, queryId, queryParameters)
    {
        queryParameters.messageType = 'QUERY';
        queryParameters.queryId = queryId;

        return this.sendMessage(channel, queryParameters);
    }

    /**
     * Send a event message (informing that something happened) using the producer client on a given channel/topic
     * @param channel 
     * @param eventId 
     * @param eventData 
     * @returns 
     */
    sendEvent(channel, eventId, eventData)
    {
        eventData.messageType = 'EVENT';
        eventData.eventId = eventId;

        return this.sendMessage(channel, eventData);
    }

    /**
     * Send a request message (requesting that something be done immediately, ex: api post/put/delete request routing) using the producer client on a given channel/topic
     * @param channel 
     * @param routeId 
     * @param requestId 
     * @param requestParameters 
     * @returns 
     */
    sendRequest(channel, routeId, requestId, requestParameters)
    {
        requestParameters.messageType = 'REQUEST';
        requestParameters.routeId = routeId;
        requestParameters.requestId = requestId;

        return this.sendMessage(channel, requestParameters);
    }

    /**
     * When a producer or consumer is connected successfully
     * @param callback 
     * @param clientType 
     */
    onConnect(callback, clientType: string = null)
    {
        if(clientType) {
            this.pubsub.on(clientType + 'OnConnect', callback);
        }
        else {
            this.pubsub.on('onConnect', callback);
        }
    }

    /**
     * When a producer or consumer is connected successfully
     * @param clientType 
     * @param callback 
     */
    onDisconnect(clientType: string, callback)
    {
        if(clientType) {
            this.pubsub.on(clientType + 'OnDisconnect', callback);
        }
        else {
            this.pubsub.on('onDisconnect', callback);
        }
    }

    /**
     * When a message is received to consumer client from a given topic
     * @param topic 
     * @param callback 
     */
    onMessage(topic, callback)
    {
        this.pubsub.on(topic, callback);
    }
}