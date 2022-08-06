import axios, { AxiosRequestConfig } from 'axios';
import https from 'https';

const config: AxiosRequestConfig = {
    httpsAgent: new https.Agent({
        rejectUnauthorized: false
    })
};

export default class RestProxy
{
    constructor()
    {
    }

    async sendRequest(method, url, body = null, headers = {}): Promise<{statusCode: number, body: any}>
    {
        return new Promise((resolve, reject) => {
            if(typeof axios[method] === 'undefined') {
                return null;
            }

            config.headers = headers;
            config.method = method;
            config.url = url;
            config.data = body;
            
            axios.request(config).then((res) => {
                return resolve({
                    statusCode: res.status,
                    body: res.data
                })
            }).catch((err) => {
                if(err.response) {
                    return resolve({
                        statusCode: err.response.status,
                        body: err.response.data
                    });
                }

                return reject(err);
            });
        });
    }
}