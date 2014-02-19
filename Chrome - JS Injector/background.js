chrome.webNavigation.onDOMContentLoaded.addListener(function(info) {
    if (/^http/i.test(info.url) && !info.frameId) {
        var code = injectCode.swap(
            '/*<scripts>*/',
            stringifyScripts(JSON.parse((localStorage.getItem('scripts') || '[]')))
        );
        code = '(function(s){s.innerHTML=unescape("'
            + escape('(' + code + ')()')
            + '");document.head.appendChild(s);})(document.createElement("script"))';
        chrome.tabs.executeScript(info.tabId, { code: code });
    }
});

String.prototype.swap = function(target, replacement, limit) {
    limit = limit || Infinity;
    var me = this, i = 0, tLen = target.length, rLen = replacement.length;
    while(limit-- && (i = me.indexOf(target, i)) + 1) {
        me = me.slice(0, i) + replacement + me.slice(i + tLen);
        i += rLen;
        if (!tLen && ++i == me.length) {
            limit = limit && 1;
        }
    }
    return me;
};

function stringifyScripts(scripts) {
    var parts = [];
    for (var i = 0, len = scripts.length; i < len; i++) {
        var scriptParts = [], script = scripts[i];
        for (var key in script) {
            if (script.hasOwnProperty(key)) {
                var part = JSON.stringify(key) + ':';
                if (key == 'filter') {
                    part += 'function(){return ' + (script['filter'] || '1') + '}';
                }
                else if (key == 'code') {
                    part += 'function(){' + (script['code'] || '') + '}';
                }
                else {
                    part += JSON.stringify(script[key]);
                }
                scriptParts.push(part);
            }
        }
        parts.push('{' + scriptParts.join(',') + '}');
    }
    return '[' + parts.join(',') + ']';
}

var inject = function() {
    var scripts = [/*<scripts>*/][0];
    var hasOwnProperty = ({}).hasOwnProperty;

    var cookies = {};
    document.cookie.split(/;\s+/).map(function(cookie) {
        if (cookie = /^([^=]+)=(.*)$/.exec(cookie)) {
            cookies[unescape(cookie[1])] = unescape(cookie[2]);
        }
    });

    var location = {
        hostname: window.location.hostname,
        pathname: window.location.pathname,
        protocol: window.location.protocol,
        origin: window.location.origin,
        search: window.location.search,
        hash: window.location.hash,
        host: window.location.host,
        href: window.location.href,
        port: window.location.port,
        param: urlParam
    };

    var urlParams = {};
    location.search.replace(
        /(?:^|)[\?&]([^=]*)(?:=([^&]*))/g,
        function(match, key, value) {
            urlParams[unescape(key.replace(/\+/g, ' '))] = unescape(value.replace(/\+/g, ' '));
        }
    );

    var RGX_VARIABLE = /(?:(?!^)\.)?([\$_A-Za-z][\$\w]*)|\[((["'])(?:[^\\]+|\\.|(?!\1)["'])\1|\d+)\]/g;
    function varExists(name, opt_typeName) {
        var varToCheck = window;
        var varFound = true;
        var remainder = name.replace(
            RGX_VARIABLE,
            function(match, varName, strVarName, strDelim, index, original) {
                if (!varFound) {
                    throw new Error(
                        'There is no variable named "' +
                        original.slice(0, index) + '".'
                    );
                }
                varName = varName || eval(strVarName);
                if (varFound = (hasOwnProperty.call(varToCheck, varName))) {
                    varToCheck = varToCheck[varName];
                }
                return '';
            }
        );
        if (remainder) {
            throw new Error(
                'Unexpected character in variable "' + name + '".'
            );
        }
        return opt_typeName ? typeOf(varFound, opt_typeName) : varFound;
    }

    var curry = (function(arrSlice) {
        return function(fn) {
            var firstArgs = arrSlice.call(arguments, 1);
            return function() {
                return fn.apply(this, firstArgs.concat(arrSlice.call(arguments, 0)));
            };
        };
    })([].slice);

    var typeOf = (function() {
        var toString = ({}).toString;
        return function(o, t) {
            o = toString.call(o).slice(8, -1);
            return t ? t == o : o;
        };
    })();

    function cookie(name, value) {
        if (hasOwnProperty.call(cookies, name)) {
            var cookieValue = cookies[name];
            return arguments.length > 1
                ? typeOf(value, 'RegExp')
                    ? value.test(cookieValue)
                    : cookieValue == value
                : cookieValue;
        }
    }

    function urlParam(name, value) {
        if (hasOwnProperty.call(urlParams, name)) {
            var urlValue = urlParams[name];
            return arguments.length > 1
                ? equals(urlValue, value)
                : urlValue;
        }
    }

    function startsWith(str, substring, ignoreCase) {
        if (ignoreCase) {
            str = str.toUpperCase();
            substring = substring.toUpperCase();
        }
        return str.slice(0, substring.length) == substring;
    }

    function endsWith(str, substring, ignoreCase) {
        if (ignoreCase) {
            str = str.toUpperCase();
            substring = substring.toUpperCase();
        }
        return str.slice(-substring.length) == substring;
    }

    function contains(str, substring, ignoreCase) {
        if (ignoreCase) {
            str = str.toUpperCase();
            substring = substring.toUpperCase();
        }
        return str.indexOf(substring) > -1;
    }

    function equals(str, value) {
        return typeOf(str, 'String') && typeOf(value, 'RegExp')
            ? value.test(str)
            : str === value;
    }

    function elements(selector, attr, value) {
        var isValueGiven = arguments.length > 2;
        var isAttrGiven = isValueGiven || arguments.length > 1;
        var elems = document.querySelectorAll(selector);
        var ret = [];
        for (var i = 0, len = elems.length; i < len; i++) {
            var elem = elems[i];
            if (!isAttrGiven || (
                    isValueGiven
                        ? equals(elem.getAttribute(attr) || elem[attr], value)
                        : (elem.hasAttribute(attr) || (attr in elem)))
                    ) {

                ret.push(elem);
            }
        }
        return ret;
    }

    function executeScripts(eventName) {
        // Execute the filters and if they pass the scripts.
        console.group('JS Injector (' + eventName + ')');
        var startTime = new Date;
        scripts.forEach(function(script) {
            if ((script.loadTime || 'onLoad') == eventName) {
                var useScript;
                try {
                    useScript = script.filter();
                }
                catch (e) {
                    console.group(script.name);
                    console.log('Filter error:', e.message);
                    console.groupEnd();
                }

                if (useScript) {
                    console.group(script.name);
                    try {
                        script.code();
                    }
                    catch (e) {
                        console.log('Code error:', JSON.stringify(e, null, 1));
                    }
                    console.groupEnd();
                }
            }
        });
        var endTime = new Date;
        console.log('Start time:  ', startTime);
        console.log('Elapsed time (milliseconds):  ', endTime - startTime);
        console.log('End time:  ', endTime);
        console.groupEnd();
    }

    // Execute the scripts to execute on DOMContentLoaded.
    executeScripts('onDOMContentLoaded');

    // Once the page and all resources have loaded, run the onload scripts.
    var onload = curry(executeScripts, 'onLoad');
    if (document.readyState == 'complete') {
        onload();
    } else {
        window.addEventListener('load', onload);
    }
};

var injectCode = inject.toString();