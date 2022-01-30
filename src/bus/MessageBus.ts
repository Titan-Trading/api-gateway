import { Kafka } from 'kafkajs';
import PubSub from '../PubSub';
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
            brokers
        });

        this.consumerGroupId = consumerGroupId;

        // setup pub-sub class
        this.pubsub = new PubSub();
    }

    async connect()
    {
        let context = this;

        // setup kafka consumer
        this.consumer = this.kafka.consumer({
            groupId: this.consumerGroupId
        });

        // setup kafka producer
        this.producer = this.kafka.producer({

        });

        // connect the consumer
        await this.consumer.connect();
        // connect the producer
        await this.producer.connect();

        this.producerIsConnected = true;

        // subscribe to all topics
        const topicsConfig = process.env.TOPICS.split(',');
        this.topics = this.topics.length ? this.topics : topicsConfig;
        for(var iT in this.topics) {
            const topic = this.topics[iT];
            await this.consumer.subscribe({
                topic: topic,
                // fromBeginning: true
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
    }

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

    onMessage(topic, callback)
    {
        this.pubsub.on(topic, callback);
    }

    async sendMessage(topic, data)
    {
        if(!this.producerIsConnected) {
            return false;
        }

        data.topic = topic;
        data.messageId = uuidv4();

        return await this.producer.send({
            topic,
            messages: [
                {
                    key: data.messageId,
                    value: JSON.stringify(data)
                }
            ]
        });
    }

    async sendCommand(channel, commandId, commandParameters)
    {
        commandParameters.messageType = 'COMMAND';
        commandParameters.commandId = commandId;

        return await this.sendMessage(channel, commandParameters);
    }

    async sendQuery(channel, queryId, queryParameters)
    {
        queryParameters.messageType = 'QUERY';
        queryParameters.queryId = queryId;

        return await this.sendMessage(channel, queryParameters);
    }

    async sendEvent(channel, eventId, eventData)
    {
        eventData.messageType = 'EVENT';
        eventData.eventId = eventId;

        return await this.sendMessage(channel, eventData);
    }

    async sendRequest(channel, routeId, requestId, requestParameters)
    {
        requestParameters.messageType = 'REQUEST';
        requestParameters.routeId = routeId;
        requestParameters.requestId = requestId;

        return await this.sendMessage(channel, requestParameters);
    }

    async disconnect()
    {
        await this.producer.disconnect();
        await this.consumer.disconnect();

        this.producerIsConnected = false;
    }
}