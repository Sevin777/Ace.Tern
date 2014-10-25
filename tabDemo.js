var server,
editor,
defs = [],
    docs = [],
    curDoc;


//returns line,ch posistion. replaces: var Pos = CodeMirror.Pos;
var Pos = function(line, ch) {
    return {
        "line": line,
        "ch": ch
    };
};

//init
$(document).ready(function() {
    editor = ace.edit("editor");
    editor.setValue('//json test object\nvar jsonObject ={\n    //prop one\n    one:"one", \n    //prop two\n    propTwo:"propTwo"\n};\n\n//comments for func\nfunction TestFn(a,b){\n    return a*b;\n}\n\n\nvar tmp = TestFn(100,200);\n\n\n$("#test").css("background-color","red");\n\n\njsonObject.\n\n requirejs(["test_dep.js"], function(test) {\n    var word = test.capitalize(test.garble("coconut"));\n    console.log(word); \n});');
    editor.setTheme("ace/theme/chrome");
    editor.session.setMode("ace/mode/javascript");
    editor.getSession().setUseWrapMode(true);
    editor.getSession().setWrapLimitRange(null, null);
    editor.setShowPrintMargin(false);
    ace.config.loadModule('ace/ext/language_tools', function() {
        ace.config.loadModule('ace/ext/tern', function() {
            editor.setOptions({
                enableTern: true,
                // ternLocalStringMinLength:3,
                enableSnippets: false,
                enableBasicAutocompletion: true
            });

            //setup server options
            server = editor.ternServer;
            server.options.plugins = {
                requirejs: {
                    "baseURL": "",
                    "paths": {}
                },
                doc_comment: true
            };
            server.options.switchToDoc = function(name, start, end, doNotCloseTips) {
                selectDoc(docID(name), doNotCloseTips);
                if (start && end) {
                    //(ghetto) - wait then jump to location once tab changed
                    setTimeout(function() {
                        editor.gotoLine(start.row, start.column || 0); //this will make sure that the line is expanded
                        var sel = curDoc.doc.getSelection();
                        sel.setSelectionRange({
                            start: start,
                            end: end
                        });
                    }, 200);
                }
            };
            server.restart(); //(needed to update options)

            //register docs
            registerDoc("test.js", editor.getSession());
            registerDoc("test_dep.js", newAceDoc(document.getElementById("requirejs_test_dep").firstChild.nodeValue));
            load("demo/underscore.js", function(body) {
                registerDoc("underscore.js", newAceDoc(body));
            });

        });
    });

    docs_BindClick();
    commands_BindChange();

    /*handled by plugin
    var keyMap = {
        "Ctrl-I": function(cm) {
            server.showType(cm);
        },
        "Ctrl-Space": function(cm) {
            server.complete(cm);
        },
        "Alt-.": function(cm) {
            server.jumpToDef(cm);
        },
        "Alt-,": function(cm) {
            server.jumpBack(cm);
        },
        "Ctrl-Q": function(cm) {
            server.rename(cm);
        }
    };*/

    /*
    server = new CodeMirror.TernServer({
        defs: defs,
        plugins: {
            requirejs: {},
            doc_comment: true
        },
        switchToDoc: function(name) {
            selectDoc(docID(name));
        },
        workerDeps: ["../../../acorn/acorn.js", "../../../acorn/acorn_loose.js", "../../../acorn/util/walk.js", "../../../../lib/signal.js", "../../../../lib/tern.js", "../../../../lib/def.js", "../../../../lib/infer.js", "../../../../lib/comment.js", "../../../../plugin/requirejs.js", "../../../../plugin/doc_comment.js"],
        workerScript: "../node_modules/codemirror/addon/tern/worker.js",
        useWorker: useWorker

    });*/

    /*editor.on("cursorActivity", function(cm) {
    server.updateArgHints(cm);
  });*/
});

//loads file via XHR and fires callback when done
function load(file, c) {
    var xhr = new XMLHttpRequest();
    xhr.open("get", file, true);
    xhr.send();
    xhr.onreadystatechange = function() {
        if (xhr.readyState == 4) c(xhr.responseText, xhr.status);
    };
}

//commands for dropdown
var commands = {
    complete: function(cm) {
        server.complete(cm);
    },
    jumptodef: function(cm) {
        server.jumpToDef(cm);
    },
    findtype: function(cm) {
        server.showType(cm);
    },
    rename: function(cm) {
        server.rename(cm);
    },
    addfile: function() {
        var name = prompt("Name of the new buffer", "");
        if (name == null) return;
        if (!name) name = "test";
        var i = 0;
        while (findDoc(name + (i || "")))++i;
        registerDoc(name + (i || ""), newAceDoc(""));
        selectDoc(docs.length - 1);
    },
    delfile: function() {
        if (docs.length == 1) return;
        unregisterDoc(curDoc);
    }
};

//bind change for command list
function commands_BindChange() {
    var cmds = $('#commands');
    cmds.on('change', function() {
        log('commands changed');
        if (!editor || cmds[0].selectedIndex === 0) return;
        var found = commands[cmds[0].value];
        cmds[0].selectedIndex = 0;
        editor.focus();
        if (found) found(editor);
    });
}

//bind click on docs (tabs) to change tab
function docs_BindClick() {
    $('#docs').on('click', function(e) {
        var target = e.target || e.srcElement;
        if (target.nodeName.toLowerCase() != "li") return;
        for (var i = 0, c = target.parentNode.firstChild;; ++i, (c = c.nextSibling))
        if (c == target) return selectDoc(i);
    });
}


// Document management

//returns new ace edit session- (auto sets mode to javscript)
function newAceDoc(documentText) {
    var EditSession = ace.require("ace/edit_session").EditSession;
    return new EditSession(documentText, "ace/mode/javascript");
}

//finds document (edit session) by name
function findDoc(name) {
    return docs[docID(name)];
}

//gets document's tab number from its name
function docID(name) {
    for (var i = 0; i < docs.length; ++i) if (docs[i].name == name) return i;
}

/**
 * Adds a document to tabs and server
 * @param {string} name - name of document including path
 * @param {ace.EditSession} doc
 */
function registerDoc(name, doc) {
    server.addDoc(name, doc);
    var data = {
        name: name,
        doc: doc
    };
    docs.push(data);
    var docTabs = document.getElementById("docs");
    var li = docTabs.appendChild(document.createElement("li"));
    li.appendChild(document.createTextNode(name));
    if (editor.getSession() == doc) {
        setSelectedDoc(docs.length - 1);
        curDoc = data;
    }
}

//removes a doc from tabs and server
function unregisterDoc(doc) {
    server.delDoc(doc.name);
    for (var i = 0; i < docs.length && doc != docs[i]; ++i) {}
    docs.splice(i, 1);
    var docList = document.getElementById("docs");
    docList.removeChild(docList.childNodes[i]);
    selectDoc(Math.max(0, i - 1));
}

//Sets selected tab, pass integer for tab number
function setSelectedDoc(pos) {
    var docTabs = document.getElementById("docs");
    for (var i = 0; i < docTabs.childNodes.length; ++i)
    docTabs.childNodes[i].className = pos == i ? "selected" : "";
}

//selects a tab by index.
function selectDoc(pos, doNotCloseTips) {
    server.hideDoc(curDoc.name, doNotCloseTips);
    setSelectedDoc(pos);
    curDoc = docs[pos];
    editor.setSession(curDoc.doc); //    editor.swapDoc(curDoc.doc);
}


//#region SCRAPS


/*  //stuff that is not relevant to tern
//config
var config = ace.require("ace/config");
config.init();

//add commands from kitchen sink demo
editor.commands.addCommands([{
  name: "execute",
  bindKey: "ctrl+enter",
  exec: function(editor) {
      try {
          var r = window.eval(editor.getCopyText() || editor.getValue());
      }
      catch (e) {
          r = e;
      }
      editor.cmdLine.setValue(r + "");
  },
  readOnly: true
}, {
  name: "showKeyboardShortcuts",
  bindKey: {
      win: "Ctrl-Alt-h",
      mac: "Command-Alt-h"
  },
  exec: function(editor) {
      config.loadModule("ace/ext/keybinding_menu", function(module) {
          module.init(editor);
          editor.showKeyboardShortcuts();
      });
  }
}]);

//see - https://github.com/ajaxorg/ace/wiki/Embedding-API
editor.getSession().selection.on('changeCursor', function() {
  //  server.updateArgHints(editor);

  try { //throws error if null
      var position = editor.getSelectionRange().start;
      var token = editor.session.getTokenAt(position.row, position.column);
      if (!token) {
          $('#CurrentToken').html('');
          return;
      }
      var r = '';
      r += token.type.toString();
      if (token.start) {
          r += "<span style='padding-left:5px; color:red;'>start: " + token.start + "</span>";
      }
      if (token.index) {
          r += "<span style='padding-left:5px; color:red;'>index: " + token.index + "</span>";
      }
      r += "<span style='padding-left:5px; color:black; font-size:10px;'>Row " + position.row + "</span>";
      r += "<span style='padding-left:5px; color:black; font-size:10px;'>Col " + position.column + "</span>";
      $('#CurrentToken').html(r);
  }
  catch (ex) {
      console.log(ex);
  }
});*/

//#endregion