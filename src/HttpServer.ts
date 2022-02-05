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

        this.app.use(cors({
            origin: "https://simpletrader.local",
            methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'],
            allowedHeaders: '*',
            exposedHeaders: ['Content-Type', 'Origin']
        }));
        this.app.use(bodyParser.json());
    }

    start(port)
    {
        // start http server on a given port
        this.app.listen(port);

        // setup global request listener
        this.app.use((req, res) => {
            this._onRequest(req, res);
        });
    }

    stop()
    {

    }

    onRequest(callback)
    {
        this._onRequest = callback;
    }
}