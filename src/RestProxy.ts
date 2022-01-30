import axios from 'axios';

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
            
            let res = null;
            if(method == 'post' || method == 'put') {
                res = await axios[method]('http://' + url, body, {
                    headers
                });

                return {
                    statusCode: res.status,
                    body: res.data
                };
            }
            else {
                res = await axios[method]('http://' + url, {
                    headers
                });

                return {
                    statusCode: res.status,
                    body: res.data
                };
            }
        }
        catch(ex) {
            if(ex.response) {
                return {
                    statusCode: ex.response.status,
                    body: ex.response.statusText
                };
            }

            return null;
        }
    }
}