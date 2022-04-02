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

    async sendRequest(method, url, body = null, headers = {})
    {
        try {
            if(typeof axios[method] === 'undefined') {
                return null;
            }

            config.headers = headers;
            config.method = method;
            config.url = url;
            config.data = body;
            
            const res = await axios.request(config);

            return {
                statusCode: res.status,
                body: res.data
            };
        }
        catch(ex) {
            if(ex.response) {
                return {
                    statusCode: ex.response.status,
                    body: ex.response.data
                };
            }

            return false;
        }
    }
}