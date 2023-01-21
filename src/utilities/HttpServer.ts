import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import PubSub from './PubSub';

export default class HttpServer
{
    private _app;
    private _server;
    private _pubSub: PubSub;

    constructor()
    {
        this._pubSub = new PubSub();

        this._app = express();

        /**
         * Middleware
         */

        // CORS
        this._app.use(cors({
            origin: [
                // production
                'https://www.tradingsystemstest.com',
                'https://tradingsystemstest.com',

                // local docker
                'https://www.tradingsystemstest.local',

                // local webpack dev server
                'http://localhost:3000'
            ],
            methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'],
            allowedHeaders: '*',
            exposedHeaders: ['Content-Type', 'Content-Length', 'Content-Range', 'X-Auth-Token', 'Origin']
        }));

        // body parser (json api)
        this._app.use(bodyParser.json());
        
        // improve stack-trace for weird request errors
        /*this._app.use((req, res, next) => {
            const render = res.render;
            const send = res.send;
            res.render = (...args) => {
                Error.captureStackTrace(this);
                return render.apply(this, args);
            };
            res.send = (...args) => {
                try {
                    send.apply(this, args);
                } catch (err) {
                    console.error(`Error in res.send | ${err.code} | ${err.message} | ${res.stack}`);
                }
            };
            next();
        });*/
    }

    start(port)
    {
        const context = this;

        // setup global request listener middleware
        this._app.use((req, res, next) => {
            context._pubSub.emit('onRequest', {req, res, next});
        });

        // middleware to detect and catch requests not proxied and handled
        this._app.use((req, res) => {
            return res.status(404).json({
                message: 'Not found'
            });
        });

        // start http server on a given port
        this._server = this._app.listen(port);
    }

    stop()
    {
        this._server.close();
    }

    onRequest(callback: (req, res, next) => void)
    {
        this._pubSub.on('onRequest', callback);
    }
}