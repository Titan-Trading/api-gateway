

export default class ServiceRepository
{
    services = {};

    constructor() {

    }

    getAll()
    {
        return this.services;
    }

    getByRequest(method, url)
    {
        for(let sI in this.services) {
            const service = this.services[sI];

            for(let eI in service.endpoints) {
                const endpoint = service.endpoints[eI];
                const endpointPattern = endpoint.url;

                if(method !== endpoint.method) {
                    continue;
                }

                const regexp = new RegExp(endpointPattern);

                if(url !== endpoint.url && !regexp.exec(url)) {
                    continue;
                }

                return service;
            }
        }

        return null;
    }

    setAll(services)
    {
        for(let sI in services) {
            const service = services[sI];

            this.services[service.id] = service;
        }
    }

    update(id, name, supportedCommunicationChannels, hostname, port, endpoints, commands, instances)
    {
        if(typeof this.services[id] === 'undefined') {
            this.services[id] = {};
        }

        this.services[id] = {
            id,
            name,
            supportedCommunicationChannels,
            hostname,
            port,
            endpoints,
            commands,
            instances
        };

        // console.log('add or update service endpoints', this.services[id]);

        return true;
    }

    remove(id)
    {
        let newServices = {};
        for(let sI in this.services) {
            if(this.services[sI].id == id) {
                continue;
            }

            newServices[sI] = this.services[sI];
        }

        this.services = newServices;

        // console.log('endpoints removed: ', this.services);

        return true;
    }
}