

export default class PendingRequestRepository
{
    pendingRequests = {};

    constructor()
    {

    }

    add(requestId, requestData)
    {
        if(this.pendingRequests[requestId]) {
            return false;
        }

        this.pendingRequests[requestId] = requestData;

        return true;
    }

    get(requestId)
    {
        if(!this.pendingRequests[requestId]) {
            return false;
        }

        return this.pendingRequests[requestId];
    }

    remove(requestId)
    {
        if(!this.pendingRequests[requestId]) {
            return false;
        }

        delete this.pendingRequests[requestId];

        return true;
    }
}