/**
 * Client class for sending log messages to logging service
 */

import MessageBus from "./MessageBus";

export default class Log
{
    private _bus: MessageBus;

    constructor(messageBus)
    {
        this._bus = messageBus;
    }

    /**
     * Log information message
     */
    info(message: string, title: string = '', category: string = '')
    {
        console.log(`${message}`);

        this._bus.sendEvent('system-logs', 'ADD', {
            instanceId: process.env.INSTANCE_ID,
            serviceId: process.env.SERVICE_ID,
            title,
            category,
            message
        });
    }

    /**
     * Log error message
     */
    error(message: string, title: string = '', category: string = '')
    {
        console.log(`${message}`);

        this._bus.sendEvent('system-logs', 'ADD', {
            instanceId: process.env.INSTANCE_ID,
            serviceId: process.env.SERVICE_ID,
            title,
            category,
            message
        });
    }

    /**
     * Log debug message
     */
    debug(message: string, title: string = '', category: string = '', fileName: string = null, lineNumber: string = null)
    {
        console.log(`${message}`);

        this._bus.sendEvent('system-logs', 'ADD', {
            instanceId: process.env.INSTANCE_ID,
            serviceId: process.env.SERVICE_ID,
            title,
            category,
            message,
            fileName,
            lineNumber
        });
    }
}