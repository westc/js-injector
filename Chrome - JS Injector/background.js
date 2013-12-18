chrome.webNavigation.onDOMContentLoaded.addListener(function(info) {
    if (/^http/i.test(info.url) && !info.frameId) {
        var code = '(function(s){;s.innerHTML=unescape("'
            + escape(
                '(' + injectCode + ')(' +
                (localStorage.getItem('scripts') || '[]') +
                ')'
            )
            + '");document.head.appendChild(s);})(document.createElement("script"))';
        chrome.tabs.executeScript(info.tabId, { code: code });
    }
});

var inject = function(scripts) {
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
                    var filter = new Function('elements', 'location', 'cookie',
                        'urlParam', 'startsWith', 'endsWith', 'contains',
                        'typeOf', 'varExists', 'equals',
                        'return ' + (script.filter.trim() || 'true'));
                    useScript = filter(elements, location, cookie, urlParam,
                        startsWith, endsWith, contains, typeOf, varExists,
                        equals);
                }
                catch (e) {
                    console.group(script.name);
                    console.log('Filter error:', e.message);
                    console.groupEnd();
                }

                if (useScript) {
                    console.group(script.name);
                    try {
                        eval(script.code);
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