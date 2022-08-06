

export default class PendingRequestRepository
{
    private pendingRequests = {};

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

    updateSent(requestId, isSent)
    {
        const pendingRequest = this.get(requestId);

        pendingRequest.sent = isSent;

        this.pendingRequests[requestId] = pendingRequest;
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