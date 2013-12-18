$(function() {
  var jWindow = $(window);
  var jBody = $('body');
  var jDialog = $('#dialog');
  var jExportDialog = $('#exportDialog');
  var jImportDialog = $('#importDialog');
  var jDialogs = $([jDialog, jExportDialog, jImportDialog]);
  var jDomLoaded = $('#radDomLoaded');
  var jLoad = $('#radLoad');
  var jTabs = $('#tabs');
  var jTab1 = jTabs.find('a[href$="#tab1"]');
  var jTab2 = jTabs.find('a[href$="#tab2"]');
  var jTab3 = jTabs.find('a[href$="#tab3"]');
  var jSortable = $('#sortable');
  var jFilter = $('#filter');
  var jCode = $('#code');
  var jName = $('#txtName');
  var jTxtExport = $('#txtExport');
  var jTxtImport = $('#txtImport');
  var jBtnExport = $('#btnExport');
  var jBtnImport = $('#btnImport');
  var jBtnToggle = $('#btnToggle');
  var scripts = JSON.parse(localStorage.getItem('scripts') || '[]');
  var scriptIndex;
  var script;

  function saveScript() {
    if (validate()) {
      saveAll();
      $(this).dialog('close');
    }
  }
  function closeDialog() {
    $(this).dialog('close');
  }
  function deleteScript() {
    if (confirm('Are you sure you want to delete this script permanently?')) {
      // The list item for this script.
      var jLI = $('li[data-index="' + scriptIndex + '"]');

      // Decreases the data-index of each LI after the one that is deleted.
      jLI.nextAll('li')
        .each(function() {
          var jLI = $(this);
          jLI.attr('data-index', +jLI.attr('data-index') - 1);
        });

      // Remove the list item for this script.
      jLI.remove();

      // Remove the script from the scripts array.
      scripts.splice(scriptIndex, 1);

      // Commit the changes to local storage.
      saveAll();
    }
    $(this).dialog('close');
  }

  var DIALOG_BUTTONS_NEW = {
    'Add Script': saveScript,
    'Cancel': closeDialog
  };
  var DIALOG_BUTTONS_MODIFY = {
    'Update Script': saveScript,
    'Delete Script': deleteScript,
    'Cancel': closeDialog
  };

  /**
   * Validates tabbed data and shows any applicable.  If no errors were found,
   * the data is saved in the scripts array.
   * @return {boolean}  True if no errors occurred, otherwise false.
   */
  function validate() {
    var errors = [];

    // Check the name.
    var name = jName.val();
    if (name) {
      for (var i = 0, len = scripts.length; i < len; i++) {
        var thatScript = scripts[i];
        if (thatScript != script
            && script.name.toUpperCase() == thatScript.name.toUpperCase()) {

          errors.push({
            msg: 'There is another script with this name.',
            tab: jTab1
          });
        }
      }
    }
    else {
      errors.push({
        msg: 'You must enter a name for the script.',
        tab: jTab1
      });
    }

    // Check the filter.
    var filter = aceFilter.getValue();
    try {
      checkFilter(filter);
    }
    catch (e) {
      errors.push({
        msg: 'Filter - ' + e.message,
        tab: jTab2
      });
    }

    // Check the code.
    var code = aceCode.getValue().trim();
    if (code) {
      try {
        new Function(code);
      }
      catch (e) {
        errors.push({
          msg: 'JS Code - ' + e.message,
          tab: jTab3
        });
      }
    }
    else {
      errors.push({
        msg: 'You must add JavaScript code.',
        tab: jTab3
      });
    }

    // Show any errors that were found (clicking the tab for the first one).
    var error1 = errors[0];
    if (error1) {
      alert(
        'The following issues must be resolved befores saving:' +
        errors.map(function(error) { return '\n- ' + error.msg; }).join('')
      );
      error1.tab.click();
    }
    // If no errors occurred, go ahead and move the script to the scripts array.
    // Also make necessary changes to the DOM.
    else {
      script.name = name;
      script.loadTime = $('input:radio[name="loadTime"]:checked').val();
      script.filter = filter;
      script.code = code;

      // If adding this script, add it to the scripts array and the DOM.
      if (scriptIndex < 0) {
        scriptIndex = $('#sortable > li').index(jLineItemAddScript);

        // Insert the script object into the scripts array.
        scripts.splice(scriptIndex, 0, script);

        // Insert new LI in the DOM.
        var jLineItemNew = jLineItem
          .clone(true)
          .attr('data-index', scriptIndex)
          .insertAfter(jLineItemAddScript);
        jLineItemNew.find('a').text(name);

        // Increases the data-index of each LI after the one that is inserted.
        jLineItemNew.nextAll('li')
          .each(function() {
            var jLI = $(this);
            jLI.attr('data-index', +jLI.attr('data-index') + 1);
          });
      }
      // If updating make sure to change the display name of the script.
      else {
        $('#sortable > li[data-index="' + scriptIndex + '"] > a').text(name);
      }
    }

    // Return a boolean indicating if no errors occurred.
    return !error1;
  }

  function checkFilter(filter) {
    var ALLOWED_WORDS = [
      '.length',
      '.toLowerCase()',
      '.toUpperCase()',
      '.search',
      '.test',
      'startsWith',
      'endsWith',
      'contains',
      'equals',
      'cookie',
      'elements',
      'typeOf',
      'varExists',
      'urlParam',
      'location.hash',
      'location.host',
      'location.hostname',
      'location.href',
      'location.origin',
      'location.param',
      'location.pathname',
      'location.port',
      'location.protocol',
      'location.search',
      'undefined',
      'null',
      'true',
      'false',
      'new',
      'Date'
    ];
    var nextIndex = 0;
    var rgxToken = /\s*(?:([\!\=\<\>]\=|[\!\(\)\<\>\+\,]|\&\&|\|\|)|((['"])(?:\\.|(?!\3|\\).)*\3)|(\/(?:[^\\\/]|\\.)+\/[gim]*)|((?:[A-Za-z]*\.)?[A-Za-z]+)|(-?\d+))/g;
    var remains = filter.replace(
      rgxToken,
      function(match, operator, string, stringDelim, rgx, variable, number, index, original) {
        // If an unexpected group of characters was encountered, throw an error.
        if (nextIndex < index) {
          var c = getPos(original, /\S/, nextIndex);
          throw new Error(
            'Unexpected character on line ' + c.line + ', character ' +
            (c.index + 1) + '.'
          );
        }

        // If the variable isn't one of the ones that is allowed, throw an error.
        if (variable && ALLOWED_WORDS.indexOf(variable) < 0) {
          var c = getPos(original, '', index);
          throw new Error(
            'Unexpected "' + variable + '" variable on line ' + c.line +
            ', character ' + (c.index + 1) + '.'
          );
        }

        // Set the next expected starting point.
        nextIndex = index + match.length;

        // Done to do a final check as to if any characters were left
        // unaccounted for.
        return '';
      }
    );
    
    if (remains.trim()) {
      var c = getPos(filter, /\S/, filter.length - remains.length);
      throw new Error(
        'Unexpected character on line ' + c.line + ', character ' +
        (c.index + 1) + '.'
      );
    }

    // Try to actually compile the code.
    new Function('return ' + filter);

    // Return the filter passed in.
    return filter;
  }

  function getPos(str, target, charOffset) {
    var remains = str.slice(charOffset || 0);
    charOffset = remains[typeOf(target, 'RegExp') ? 'search' : 'indexOf'](target);
    if (charOffset >= 0) {
      remains = str.slice(0, str.length - remains.length + charOffset).split(/\r?\n|\r/);
      return {
        line: remains.length,
        index: remains[remains.length - 1].length
      };
    }
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

  function saveAll() {
    localStorage.setItem('scripts', JSON.stringify(scripts));
  }

  // Changes the order of the scripts array after the user resorts.
  jSortable.sortable({
    stop: function( event, ui ) {
      var newScripts = [];
      var i = 0;
      $('#sortable > li').each(function() {
        var jMe = $(this);
        var index = +jMe.attr('data-index');
        if (index > -1) {
          jMe.attr('data-index', i++);
          newScripts.push(scripts[index]);
        }
      });
      scripts = newScripts;
      saveAll();
    }
  });
  jSortable.disableSelection();

  // Create a normal sortable script line item.
  var jLineItem = $(
    '<li class="ui-state-default">' +
      '<span class="ui-icon ui-icon-arrowthick-2-n-s"></span>' +
      '<a class="script-title"></a>' +
    '</li>'
  );
  $('a', jLineItem).click(function() {
    var jMe = $(this);
    var jLineItem = jMe.parent();
    scriptIndex = +jLineItem.attr('data-index');
    script = scripts[scriptIndex] || {
      name: '',
      filter: '',
      code: ''
    };
    jDialog
      .dialog('option', {
        title: script.name || '[Unnamed Script]',
        buttons: scriptIndex < 0 ? DIALOG_BUTTONS_NEW : DIALOG_BUTTONS_MODIFY
      })
      .dialog('open');
  });

  // "ADD A SCRIPT" line item.
  var jLineItemAddScript = jLineItem.clone(true).attr('data-index', '-1');
  jLineItemAddScript.find('a')
    .prop('id', 'addScriptTitle')
    .text('>>> ADD A SCRIPT <<<');
  jSortable.append(jLineItemAddScript);

  jLineItem.find('span').after('<input type="checkbox" /> ');

  // Initialize the dialog box.
  jDialog.dialog({
    autoOpen: false,
    closeOnEscape: false,
    modal: true,
    draggable: false,
    resizable: false,
    open: function() {
      jTab1.click();
      jName.val(script.name);
      var loadTime = script.loadTime || 'onLoad';
      jDomLoaded[0].checked = loadTime == 'onDOMContentLoaded';
      jLoad[0].checked = loadTime == 'onLoad';
      aceFilter.setValue(script.filter);
      aceCode.setValue(script.code);
      jWindow.resize();
    }
  });

  var hasOwnProperty = {}.hasOwnProperty;

  var SCRIPT_STRING_PROPS = ['name', 'filter', 'code', 'loadTime'];

  function importScripts(overwriteExisting) {
    try {
      var scriptsToImport = JSON.parse(aceImport.getValue());
      if (!typeOf(scriptsToImport, 'Array')) {
        throw new Error('the object being imported must be an array');
      }

      var nameToIndex = {};
      for (var i = 0, len = scripts.length; i < len; i++) {
        nameToIndex[scripts[i].name] = i;
      }

      for (var i = 0, len = scriptsToImport.length; i < len; i++) {
        var scriptIn = scriptsToImport[i];
        var alreadyExists = hasOwnProperty.call(nameToIndex, scriptIn.name);
        if (overwriteExisting || !alreadyExists) {
          SCRIPT_STRING_PROPS.forEach(function(prop) {
            if (!typeOf(scriptIn[prop], 'String')) {
              throw new Error('the "' + prop + '" property for item ' + (i + 1)
                + ' is not a string');
            }
          });

          if (alreadyExists) {
            scripts[nameToIndex] = scriptIn;
          }
          else {
            scripts.push(scriptIn);
          }
        }
      }

      localStorage.setItem('scripts', JSON.stringify(scripts));
      location.reload();
    }
    catch (e) {
      alert('The script(s) could not be imported due to the following error:  '
        + e.message);
    }
  }

  jImportDialog.dialog({
    buttons: {
      'Import & Overwrite': curry(importScripts, true),
      'Import w/o Overwrite': importScripts,
      'Cancel': closeDialog
    },
    autoOpen: false,
    modal: true,
    draggable: false,
    resizable: false,
    open: function() {
      aceImport.setValue('');
      aceImport.selectAll();
      jWindow.resize();
    }
  });

  jBtnImport.click(function() {
    jImportDialog.dialog('open');
  });

  jExportDialog.dialog({
    buttons: { 'Close': closeDialog },
    autoOpen: false,
    modal: true,
    draggable: false,
    resizable: false,
    open: function() {
      var scriptsToExport = [];
      jSortable.find('li:has(input:checkbox:checked)').each(function() {
        scriptsToExport.push(scripts[this.getAttribute('data-index')]);
      });
      aceExport.setValue(JSON.stringify(scriptsToExport, null, 1));
      aceExport.selectAll();
      jWindow.resize();
    }
  });

  jBtnExport.click(function() {
    jExportDialog.dialog('open');
  });

  jBtnToggle.click(function() {
    jSortable.find('input:checkbox').click();
  });

  // Setup the jQuery tabs.
  jTabs.tabs();
  jTab1.click(function() {
    jName.focus();
  });
  jTab2.click(function() {
    aceFilter.focus();
    aceFilter.gotoLine(1, 0);
  });
  jTab3.click(function() {
    aceCode.focus();
    aceCode.gotoLine(1, 0);
  });

  jName.change(function() {
    jDialog.dialog('option', 'title', this.value || '[Unnamed Script]');
  });

  // Setup elements so that on a resize everything will still look good.
  jWindow.resize(function() {
    jDialogs.each(function(dialog) {
      $(this).dialog(
        'option',
        { height: jWindow.height() - 100, width: jWindow.width() - 100 }
      );
    });

    var height = jTabs.parent().height() - 10;
    jTabs.height(height);
    $([jFilter[0], jCode[0]]).height(height - 55);

    jTxtImport.height(jImportDialog.height());

    jTxtExport.height(jExportDialog.height());
  });

  // Setup buttons in bottom bar.
  $('.bottomBar button').button().filter('[data-menu]').each(function(i, elem) {
    $(elem).click(function() {
      $('.bottomBar > *').hide()
        .filter('.' + elem.getAttribute('data-menu')).show();
    });
  });

  // Show the saved scripts.
  scripts.forEach(function(script, index) {
    jLineItem.clone(true)
      .appendTo(jSortable)
      .attr('data-index', index)
      .find('a')
        .text(script.name);
  });

  // Setup ACE (http://ace.c9.io/).
  function setupIDE(elemId, mode) {
    var aceElem = ace.edit(elemId);
    aceElem.setTheme("ace/theme/clouds");
    aceElem.getSession().setMode("ace/mode/" + mode);
    return aceElem;
  }

  var aceFilter = setupIDE('filter', 'javascript'),
    aceCode = setupIDE('code', 'javascript'),
    aceExport = setupIDE('txtExport', 'json'),
    aceImport = setupIDE('txtImport', 'json');
});