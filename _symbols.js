const symbols = {};


module.exports = function ref(obj, name, val){
    if(symbols[name] === undefined){
        symbols[name] = Symbol();
    }
    if(val !== undefined){
        obj[symbols[name]] = val;
    }
    return obj[symbols[name]];
}

module.exports.unset = function(obj, name){
    if(symbols[name] === undefined) return;
    delete obj[symbols[name]];
}