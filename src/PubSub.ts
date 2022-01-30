

export default class PubSub
{
    subscribers = {};

    constructor()
    {

    }

    on(eventChannel, callback)
    {
        if(typeof this.subscribers[eventChannel] === 'undefined') {
            this.subscribers[eventChannel] = [];
        }

        if(typeof callback !== 'function') {
            return false;
        }
        
        this.subscribers[eventChannel].push(callback);

        return true;
    }

    off(eventChannel)
    {
        if(typeof this.subscribers[eventChannel] === 'undefined') {
            return false;
        }

        delete this.subscribers[eventChannel];
        
        return true;
    }

    emit(eventChannel, eventData)
    {
        if(typeof this.subscribers[eventChannel] === 'undefined') {
            return false;
        }

        if(!Array.isArray(this.subscribers[eventChannel]) || !this.subscribers[eventChannel].length) {
            return false;
        }

        for(let sI in this.subscribers[eventChannel]) {
            if(typeof this.subscribers[eventChannel] == 'undefined' || typeof this.subscribers[eventChannel][sI] !== 'function') {
                continue;
            }

            this.subscribers[eventChannel][sI](eventData);
        }
    }
}