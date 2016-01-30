//json test object
var jsonObject = {
    //prop one
    one: "one",
    //prop two
    propTwo: "propTwo"
};

//type a dot after json object and tern will get properties
jsonObject

/**
 * Description of this fn
 * @param {int} a - first number
 * @param {decimal} b - second number
 * @param {number} [c] - third number to include
 * @param {bool} [useSum=false] - pass true to use sum instead of product
 * @returns {number} the product of the passed parameters
 */
function TestFn(a, b, c, useSum) {
    if (useSum === true) {
        if (c) return a + b + c;
        return a + b;
    }
    if (c) return a * b * c;
    return a * b;
}

//place cursor inside of parenthesis to see argument hints
var tmp = TestFn(100, 200);

/**
 * test function with object as argument and jsDoc comments that describe the object properties
 * @param {object} obj
 * @param {bool} [obj.boolProp=false] - bool property
 * @param {array} [obj.arrayProp] - array property
 * @param {string} [obj.stringProp=default string] - string property with default
 * @returns {object} passed object with default values set where properties are missing
 */
function TestObjectArg(obj) {
    if (typeof(obj) !== "object") {
        throw new Error("obj parameter is required and must be an object");
    }
    if (!obj.boolProp) {
        obj.boolProp = false;
    }
    if (!Array.isArray(obj.arrayProp)) {
        obj.arrayProp = [];
    }
    if (typeof(obj.stringProp) !== "string") {
        obj.stringProp = "default string";
    }
    return obj;
}

//place cursor inside of parenthesis to see advanced object arg hints from comments
TestObjectArg();
