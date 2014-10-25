/*
 * helpers.js version 1.2 - Morgan Yarbrough
 */

/**
* Logs Debug information to console;
* Call from any function and simply pass arguments;
* Example: DBG(arguments);
* @param {array} a - the 'arguments' variable in the current function
* @param {bool} [logParams=false] - pass true to log parameters as objects to console
* @param {bool} [NoTrace=false] - pass true to prevent adding stack trace
*/
function DBG(a, logParams, NoTrace) {
    if (logParams !== true) {
        logParams = false;
    }
    var brk = "\n---------------------------------\n";
    var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
    var ARGUMENT_NAMES = /([^\s,]+)/g;
    //gets parameter names
    function getParamNames(func) {
        var fnStr = func.toString().replace(STRIP_COMMENTS, '');
        var result = fnStr.slice(fnStr.indexOf('(') + 1, fnStr.indexOf(')')).match(ARGUMENT_NAMES);
        if (result === null)
            result = [];
        return result;
    }
    var r = '';
    try {
        if (!a) {
            console.log('DBG called by arguments are missing' + new Error().stack);
            return;
        }
        //get info from caller
        if (a.callee) {
            if (a.callee.name) {
                r += "Fn Name: " + a.callee.name;
            }
            else {
                r += "Fn Name: undefined";
            }
            if (a.callee.caller) {
                r += brk;
                if (a.callee.caller.name) {
                    r += "Called By: " + a.callee.caller.name;
                }
                else {
                    r += "Called By: Anonymous function, first 200 chars below: \n\n" + a.callee.caller.toString().substr(0, 200) + "\n";
                }
            }
            //get param names from function, returns array
            var params = getParamNames(a.callee);
            if (params.length > 0) {
                r += brk;
                if (logParams) {
                    r += "Parameters will be logged to console";
                    if (window.logOtempCount == undefined) {
                        window.logOtempCount = 0;
                    }
                }
                else {
                    r += "Parameters:";
                }
            }
            for (var i = 0; i < params.length; i++) {
                try {
                    if (logParams) {

                        logOtempCount++;
                        if (logOtempCount > 99) {
                            logOtempCount = 1;
                        }
                        var globalVarName = 'tmp' + logOtempCount;
                        window[globalVarName] = a[i];
                        console.log(globalVarName + "=(param) " + params[i] + ": ", a[i]);

                    }
                    else {
                        r += "\n    " + params[i] + ": "
                        try {
                            r += JSON.stringify(a[i], null, "\t");
                        }
                        catch (ex) {
                            r += " (failed to stringify parameter): " + ex;
                        }
                    }
                }
                catch (ex) {
                    r += "\n error getting param: " + ex;
                }
            }
        }
        if (!NoTrace) {
            try {
                r += brk + "Stack:";
                r += "\n" + new Error().stack.replace('Error', '');
            }
            catch (ex) {
                r += "\n Ran into error trying to print stack: " + ex;
            }
        }
        console.log(r + "\n\n");
    }
    catch (ex) {
        console.log('DBG called and ran into error:', ex);
    }
}

/**
 * Logs a object with description and sets a global variable for testing it
 * @param {obj} object
 * @param {string} [str_Description] - description for object
 * @param {bool} [NoTrace=false] - pass true to prevent adding stack trace
 */
function logO(object, str_Description, NoTrace) {
    try {
        if (window.logOtempCount == undefined) {
            window.logOtempCount = 0;
        }
        var globalVarName = '';
        logOtempCount++;
        if (logOtempCount > 99) { logOtempCount = 1; }//max of 99 temp vars
        globalVarName = 'tmp' + logOtempCount;
        window[globalVarName] = object;
        str_Description = 'window.' + globalVarName + ' = ' + str_Description + ' (next logged object) ';
        //add mini stack
        if (!NoTrace) {
            try {
                var traces = new Error().stack.replace('Error', '').split('\n');
                var validTraceCount = 0;
                var validTraces = [];
                for (var i = 0; i < traces.length; i++) {
                    var t = traces[i].trim();
                    if (!t) {
                        continue;
                    }
                    if (t.toLowerCase().indexOf("at log") !== -1) {//dont log this
                        continue;
                    }
                    validTraces.push(t);
                    validTraceCount++;
                    if (validTraceCount > 1) { break; }
                }
                str_Description += '\n' + validTraces.join('\n');
            }
            catch (ex) { setTimeout(function () { throw (ex); }, 0); }
        }
        if (str_Description) {
            console.log('\n' + str_Description);
        }
        console.log(object);
    }
    catch (ex) { setTimeout(function () { throw (ex); }, 0); }
}

/**
 * Logs passed arugments (pass as many as desired) intelligently including the type of object and a mini stack trace;
 * Automatically logs stack of error (but doesnt throw error);
 * Automatically groups multiple args in log for chrome;
 *
 * @param {object} [options] - (must be first argument)
 * @param {bool} [options.stack=true] - determines if stack trace is logged
 * @param {bool} [options.time=true] - determines if time logged
 * @param {bool} [options.vars=true] - determines if object should be set to global variable names
 *
 * @Example for logging error with description (assume ex is an error): log('some info about error', ex);
 */
function log() {
    if (!window.hasOwnProperty('advancedConsole')) {
        //https://developer.chrome.com/devtools/docs/console. Oher browsers support but I only care about chrome and dont want to do further checking.
        window.advancedConsole = new RegExp('chrome', 'i').test(navigator.userAgent);
    }
    //check if options passed as first arg
    var options = {
        'stack': true,
        'time': true,
        'vars': true
    };
    var firstLog = 0;
    var noStack = false;
    var firstArg = arguments[0];
    if (arguments.length > 1) {
        if (firstArg && (firstArg.hasOwnProperty('stack') || firstArg.hasOwnProperty('time') || firstArg.hasOwnProperty('vars'))) {
            try {
                if (firstArg.constructor.name.indexOf('Error') !== -1) {
                    firstLog = 1;
                    if (firstArg.hasOwnProperty('stack')) {
                        options['stack'] = firstArg['stack'];
                    }
                    if (firstArg.hasOwnProperty('time')) {
                        options['time'] = firstArg['time'];
                    }
                    if (firstArg.hasOwnProperty('vars')) {
                        options['vars'] = firstArg['vars'];
                    }

                }
            }
            catch (ex) {}
        }
    }
    if (window.logOtempCount === undefined) {
        window.logOtempCount = 0;
    }
    if (advancedConsole && arguments.length > 1) {
        if (!window.hasOwnProperty('logOGroup')) {
            window.logOGroup = 0;
        }
        window.logOGroup++;
        console.group('log# ' + logOGroup);
    }
    //get Stack
    var stack = '';
    if (options.stack) {
        try {
            var traces = new Error().stack.replace('Error', '').split('\n');
            var validTraceCount = 0;
            var validTraces = [];
            for (var i = 0; i < traces.length; i++) {
                var t = traces[i].trim();
                if (!t) {
                    continue;
                }
                if (t.toLowerCase().indexOf("at log") !== -1) { //dont log this
                    continue;
                }
                validTraces.push(t);
                validTraceCount++;
                if (validTraceCount > 1) {
                    break;
                }
            }
            stack = validTraces.join('\n').replace(/\s+/g, " ").trim();
            stack += '\n';
        }
        catch (ex) {
            setTimeout(function() {
                throw (ex);
            }, 0);
        }
    }
    //do loop
    for (var i = firstLog; i < arguments.length; i++) {
        var msg = '';
        var logObject = false;
        var a = arguments[i];
        var type = '';
        var css = '';
        try {
            if (a === undefined) {
                type = " (undefined) ";
            }
            else if (a === null) {
                type = " (null) ";
            }
            else {
                type = a.constructor.name;
                if (type === 'String' || type === 'Number') {
                    msg += a;
                }
                else if (type === 'Array' || type === 'Function') {
                    msg += 'Type: ' + type + '\n' + 'value: ' + '(Next Logged Object)';
                    logObject = true;
                }
                else if (type.indexOf('Error') !== -1 && a.hasOwnProperty('stack')) {
                    //catches all error types: TypeError|EvalError|InternalError|RangeError|SyntaxError|URIError
                    msg += 'Type:  ' + type;
                    try {
                        msg += '\nStack: ' + a.stack.toString(); //note that stack contains the message
                        noStack = true;
                        if (advancedConsole) {
                            css = 'color:red;';
                        }
                    }
                    catch (ex) {
                        logObject = true; //failed to get stack
                        css = '';
                    }
                }
                else { //any other type is a class
                    msg += 'Type: ' + type + '\n' + 'value: ' + '(Next Logged Object)';
                    logObject = true;
                }
            }
        }
        catch (ex) { //will throw error if undefined or null
            type = 'a.constructor.name failed: ' + ex.message;
            if (a === undefined) {
                msg += 'Type: ' + type + '\n' + 'value: ' + 'undefined';
            }
            else if (a === null) {
                msg += 'Type: ' + type + '\n' + 'value: ' + 'null';
            }
            else {
                msg += 'Type: ' + type + '\n' + 'value: ' + '(Next Logged Object)';
                logObject = true;
                setTimeout(function() {
                    throw (ex);
                }, 0); //not sure why this error occurred
            }
        }
        //now do the logging
        msg = msg;
        var time = (options.time && i === firstLog) ? getTime() + '\n' : '';
        if (logObject) {
            var globalVarName = '';
            if (options.vars) {
                logOtempCount++;
                if (logOtempCount > 99) {
                    logOtempCount = 1;
                } //max of 99 temp vars
                globalVarName = 'tmp' + logOtempCount;
                window[globalVarName] = a;
                globalVarName = '\t window.' + globalVarName + '=\n'; //for string below
            }
            if (i === firstLog) {
                console.log('\n' + time + stack, msg + globalVarName, a);
            }
            else {
                console.log(msg + globalVarName, a);
            }
        }
        else {
            if (i === firstLog) {
                if (css) {
                    console.log('\n' + time + noStack ? '' : stack);
                    console.log('%c' + msg, css);
                }
                else {
                    console.log('\n' + time + noStack ? '' : stack, msg);
                }
            }
            else {
                if (css) {
                    console.log('%c' + msg, css);
                }
                else {
                    console.log(msg);
                }
            }
        }
    }
    if (advancedConsole && arguments.length > 1) {
        console.groupEnd('log# ' + logOGroup);
    }
}

/**
 * gets current time formatted with milliseconds
 */
function getTime() {
    var D = new Date();
    return ((D.getHours() < 10) ? "0" : "") + D.getHours() + ":" + ((D.getMinutes() < 10) ? "0" : "") + D.getMinutes() + ":" + ((D.getSeconds() < 10) ? "0" : "") + D.getSeconds() + ":" + (D.getMilliseconds() < 10 ? "0" : "") + D.getMilliseconds();
}

/**
* Console.Log for stopwatch (date) for benchmarking
* Example:  var SW = new Date(); [TimeSomething] LogSW(SW, 'OptionalDescription');
* @param {date} date_SW - start time
* @param {string} [str_Msg] - message to display
* @param {bool} [bool_UseMS=true] determines if dispay should be in milliseconds
*/
function logSW(date_SW, str_Msg, bool_UseMS) {
    if (typeof (bool_UseMS) === 'undefined') {
        bool_UseMS = true;
    }
    try {
        var s = '';
        if (bool_UseMS === true) {
            s = parseFloat(parseInt((new Date() - date_SW))).toFixed(0) + ' ms ; ';
        }
        else {
            s = parseFloat(parseInt((new Date() - date_SW)) / 1000).toFixed(2) + ' sec ; ';
        }
        log(s + str_Msg);
    }
    catch (ex) { log('LogSW error:', ex); }
}