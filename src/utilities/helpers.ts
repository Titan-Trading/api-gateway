

export function sleep(ms: number): Promise<boolean>
{
    return new Promise((resolve, reject) => {
        setTimeout(() => resolve(true), ms);
    });
}

export function pluck(pluckedKeys: Array<string>, subject: object): object
{

    let newSubject = {};

    pluckedKeys.forEach((key) => {
        if(typeof subject[key] !== 'undefined') {
            newSubject[key] = subject[key];
        }
    })

    return newSubject;
}