import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';

export default class HttpServer
{
    app = null;
    _onRequest = null;

    constructor()
    {
        this.app = express();

        /**
         * Middleware
         */

        // CORS
        this.app.use(cors({
            origin: ["https://simpletrader.local", 'http://localhost:3000'],
            methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'],
            allowedHeaders: '*',
            exposedHeaders: ['Content-Type', 'X-Auth-Token', 'Origin']
        }));

        // body parser (json api)
        this.app.use(bodyParser.json());
        
        // improve stack-trace for weird request errors
        this.app.use((req, res, next) => {
            const render = res.render;
            const send = res.send;
            res.render = function renderWrapper(...args) {
                Error.captureStackTrace(this);
                return render.apply(this, args);
            };
            res.send = function sendWrapper(...args) {
                try {
                    send.apply(this, args);
                } catch (err) {
                    console.error(`Error in res.send | ${err.code} | ${err.message} | ${res.stack}`);
                }
            };
            next();
        });
    }

    start(port)
    {
        // setup global request listener
        this.app.use((req, res) => {
            return this._onRequest(req, res);
        });

        // start http server on a given port
        this.app.listen(port);
    }

    stop()
    {
        this.app.close();
    }

    onRequest(callback)
    {
        this._onRequest = callback;
    }
}