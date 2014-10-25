/**
 * Ace Tern server configuration (uses worker in separate file)
 *
 * TODO:
 * - make enable/disable tern server via ace config and expose the server as public exports
 * - auto init the server and disable it when its not needed
 */
ace.define('ace/ext/tern', ['require', 'exports', 'module', 'ace/snippets', 'ace/autocomplete', 'ace/config', 'ace/editor'],
function(require, exports, module) {

    //#region LoadCompletors_fromLangTools

    /* Copied from ext-language_tools.js
     * needed to allow completors for all languages
     * adds extra logic to disable keyword and basic completors for javscript mode and enable tern instead
     */
    var snippetManager = require("../snippets").snippetManager;
    var snippetCompleter = {
        getCompletions: function(editor, session, pos, prefix, callback) {
            var snippetMap = snippetManager.snippetMap;
            var completions = [];
            snippetManager.getActiveScopes(editor).forEach(function(scope) {
                var snippets = snippetMap[scope] || [];
                for (var i = snippets.length; i--;) {
                    var s = snippets[i];
                    var caption = s.name || s.tabTrigger;
                    if (!caption) continue;
                    completions.push({
                        caption: caption,
                        snippet: s.content,
                        meta: s.tabTrigger && !s.name ? s.tabTrigger + "\u21E5 " : "snippet"
                    });
                }
            }, this);
            callback(null, completions);
        }
    };
    var textCompleter = require("../autocomplete/text_completer");
    var keyWordCompleter = {
        getCompletions: function(editor, session, pos, prefix, callback) {
            var state = editor.session.getState(pos.row);
            var completions = session.$mode.getCompletions(state, session, pos, prefix);
            callback(null, completions);
        }
    };
    var completers = [snippetCompleter, textCompleter, keyWordCompleter];
    exports.addCompleter = function(completer) {
        completers.push(completer);
    };
    var expandSnippet = {
        name: "expandSnippet",
        exec: function(editor) {
            var success = snippetManager.expandWithTab(editor);
            if (!success) editor.execCommand("indent");
        },
        bindKey: "tab"
    };
    var loadSnippetsForMode = function(mode) {
        var id = mode.$id;
        if (!snippetManager.files) snippetManager.files = {};
        loadSnippetFile(id);
        if (mode.modes) mode.modes.forEach(loadSnippetsForMode);
    };
    var loadSnippetFile = function(id) {
        if (!id || snippetManager.files[id]) return;
        var snippetFilePath = id.replace("mode", "snippets");
        snippetManager.files[id] = {};
        config.loadModule(snippetFilePath, function(m) {
            if (m) {
                snippetManager.files[id] = m;
                m.snippets = snippetManager.parseSnippetFile(m.snippetText);
                snippetManager.register(m.snippets, m.scope);
                if (m.includeScopes) {
                    snippetManager.snippetMap[m.scope].includeScopes = m.includeScopes;
                    m.includeScopes.forEach(function(x) {
                        loadSnippetFile("ace/mode/" + x);
                    });
                }
            }
        });
    };
    //#endregion


    //#region AutoComplete

    /* Override the StartAutoComplete command (from ext-language_tools)   */
    var Autocomplete = require("../autocomplete").Autocomplete;
    Autocomplete.startCommand = {
        name: "startAutocomplete",
        exec: function(editor) {
            if (!editor.completer) {
                editor.completer = new Autocomplete();
            }
            //determine which completers should be enabled
            editor.completers = [];
            if (editor.$enableSnippets) { //snippets are allowed with or without tern
                editor.completers.push(snippetCompleter);
            }

            if (editor.ternServer && editor.$enableTern) {
                //enable tern based on mode
                if (editor.ternServer.enabledAtCurrentLocation(editor)) {
                    editor.completers.push(editor.ternServer);
                }
                else {
                    if (editor.$enableBasicAutocompletion) {
                        editor.completers.push(textCompleter, keyWordCompleter);
                    }
                }
            }
            else { //tern not enabled
                if (editor.$enableBasicAutocompletion) {
                    editor.completers.push(textCompleter, keyWordCompleter);
                }
            }
            editor.completer.showPopup(editor);
            editor.completer.cancelContextMenu();
        },
        bindKey: "Ctrl-Space|Ctrl-Shift-Space|Alt-Space"
    };
    var onChangeMode = function(e, editor) {
        loadSnippetsForMode(editor.session.$mode);
        // log(editor, editor.session.$mode);
    };
    //#endregion


    //#region Tern
    var TernServer = require("../tern").TernServer;
    var aceTs = new TernServer({
        defs: ['jquery', 'browser', 'ecma5'],
        plugins: {
            doc_comment: true
        },
        workerScript: ace.config.moduleUrl('worker/tern'),
        useWorker: true,
        switchToDoc: function(name, start) {
            console.log('COMEBACK. add functionality to siwtch to doc from tern. name=' + name + '; start=' + start);
        }
    });
    //hack: need a better solution to get the editor variable inside of the editor.getSession().selection.onchangeCursor event as the passed variable is of the selection, not the editor. This variable is being set in the enableTern set Option
    var editor_for_OnCusorChange = null;

    //show arguments hints when cursor is moved
    var onCursorChange_Tern = function(e, editor_getSession_selection) {
        editor_for_OnCusorChange.ternServer.updateArgHints(editor);
    };

    //automatically start auto complete when period is typed
    var onAfterExec_Tern = function(e, commandManager) {
        if (e.command.name === "insertstring" && e.args === ".") {
            if (e.editor.ternServer && e.editor.ternServer.enabledAtCurrentLocation(e.editor)) {
                var pos = editor.getSelectionRange().end;
                var tok = editor.session.getTokenAt(pos.row, pos.column);
                if (tok) {
                    if (tok.type !== 'string' && tok.type.toString().indexOf('comment') ===-1) {
                        e.editor.execCommand("startAutocomplete");
                    }
                }
            }
        }
    };
    
    //minimum string length for tern local string completions. set to -1 to disable this
    var ternLocalStringMinLength=3;

    console.log('TODO- add method for turning off tern server, should also be automatic on mode change. Make sure to remove the cursorchange event bindings that tern has when its off/disabled');
    completers.push(aceTs); //add
    exports.server = aceTs;

    var config = require("../config");
    var Editor = require("../editor").Editor;
    config.defineOptions(Editor.prototype, "editor", {
        enableTern: {
            set: function(val) {
                if (val) {
                    //set default ternLocalStringMinLength
                    if(this.getOption('ternLocalStringMinLength') === undefined){
                        this.setOption('ternLocalStringMinLength',ternLocalStringMinLength);
                    }
                    this.completers = completers;
                    this.ternServer = aceTs;
                    this.commands.addCommand(Autocomplete.startCommand);
                    editor_for_OnCusorChange = this; //hack
                    this.getSession().selection.on('changeCursor', onCursorChange_Tern);
                    this.commands.on('afterExec', onAfterExec_Tern);
                    aceTs.bindAceKeys(this);
                }
                else {
                    this.ternServer = undefined;
                    this.getSession().selection.off('changeCursor', onCursorChange_Tern);
                    this.commands.off('afterExec', onAfterExec_Tern);
                    if (!this.enableBasicAutocompletion) {
                        this.commands.removeCommand(Autocomplete.startCommand);
                    }
                }
            },
            value: false
        },
        ternLocalStringMinLength: {
            set: function(val) {
               ternLocalStringMinLength = parseInt(val,10);
            },
            value: false
        },
        enableBasicAutocompletion: {
            set: function(val) {
                if (val) {
                    this.completers = completers;
                    this.commands.addCommand(Autocomplete.startCommand);
                }
                else {
                    if (!this.$enableTern) {
                        this.commands.removeCommand(Autocomplete.startCommand);
                    }
                }
            },
            value: false
        },
        enableSnippets: {
            set: function(val) {
                if (val) {
                    this.commands.addCommand(expandSnippet);
                    this.on("changeMode", onChangeMode);
                    onChangeMode(null, this);
                }
                else {
                    this.commands.removeCommand(expandSnippet);
                    this.off("changeMode", onChangeMode);
                }
            },
            value: false
        }
        //ADD OPTIONS FOR TERN HERE... maybe-- or just let the exports do it
    });
    //#endregion
});

/**
 *  tern server plugin for ace
 */
ace.define('ace/tern', ['require', 'exports', 'module', 'ace/lib/dom'], function(require, exports, module) {

    //#region TernServerPublic

    /**
     * Tern Server Constructor {@link http://ternjs.net/doc/manual.html}
     * @param {object} options - Options for server
     * @param {string[]} [options.defs] - The definition objects to load into the server’s environment.
     * @param {object} [options.plugins] - Specifies the set of plugins that the server should load. The property names of the object name the plugins, and their values hold options that will be passed to them.
     * @param {function} [options.getFile] - Provides a way for the server to try and fetch the content of files. Depending on the async option, this is either a function that takes a filename and returns a string (when not async), or a function that takes a filename and a callback, and calls the callback with an optional error as the first argument, and the content string (if no error) as the second.
     * @param {bool} [options.async=false] - Indicates whether getFile is asynchronous
     * @param {int} [options.fetchTimeout=1000] - Indicates the maximum amount of milliseconds to wait for an asynchronous getFile before giving up on it
     */
    var TernServer = function(options) {
        var self = this;
        this.options = options || {};
        var plugins = this.options.plugins || (this.options.plugins = {});
        if (!plugins.doc_comment) {
            plugins.doc_comment = true;
        }
        if (this.options.useWorker) {
            //console.log('using workiner');
            this.server = new WorkerServer(this);
        }
        else {
            //  logO(plugins, 'plugins in new tern server');
            this.server = new tern.Server({
                getFile: function(name, c) {
                    return getFile(self, name, c);
                },
                async: true,
                defs: this.options.defs || [],
                plugins: plugins
            });
        }
        this.docs = Object.create(null);
        /**
         * Fired from editor.onChange
         * @param {object} change - change event from editor
         * @param {editor} doc
         */
        this.trackChange = function(change, doc) {
            trackChange(self, doc, change);
        };
        this.cachedArgHints = null;
        this.activeArgHints = null;
        this.jumpStack = [];
    };

    /**
     * returns line,ch posistion
     */
    var Pos = function(line, ch) {
        return {
            "line": line,
            "ch": ch
        }
    };
    var cls = "Ace-Tern-";
    var bigDoc = 250;

    var aceCommands = {
        ternJumpToDef: {
            name: "ternJumpToDef",
            exec: function(editor) {
                editor.ternServer.jumpToDef(editor);
            },
            bindKey: "Alt-."
        }
    };


    TernServer.prototype = {
        bindAceKeys: function(editor) {
            editor.commands.addCommand(aceCommands.ternJumpToDef);

        },
        /**
         * Add a file to tern server
         * @param {string} name = name of file
         * @param {string} doc = contents of the file OR the entire ace editor? (in code mirror it adds the CodeMirror.Doc, which is basically the whole editor)
         */
        addDoc: function(name, doc) {
            //logO(doc, 'addDoc.doc');
            var data = {
                doc: doc,
                name: name,
                changed: null
            };
            var value = '';
            //GHETTO: hack to let a plain string work as a document for auto complete only. need to comeback and fix (make it add a editor or editor session from the string)
            if(doc.constructor.name === 'String'){
                value = doc;
            }
            else{
                value =docValue(this, data);
                doc.on("change", this.trackChange);
            }
            this.server.addFile(name, value);
            return this.docs[name] = data;
        },
        /**
         * Remove a file from tern server
         * @param {string} name = name of file
         */
        delDoc: function(name) {
            found.doc.off("change", this.trackChange);
            delete this.docs[name];
            this.server.delFile(name);
        },
        /**
         * Dont know what this does. There is no documentation on it;
         * The secndDoc method this calls sends a request of type 'files' that sends a doc to the server;
         * Perhaps it updates the current document prior to hiding it?
         */
        hideDoc: function(name) {
            closeArgHints(this);
            var found = this.docs[name];
            if (found && found.changed) sendDoc(this, found);
        },
        /**
         * Gets completions to display in editor when Ctrl+Space is pressed; This is called by
         * CodeMirror equivalent: complete()
         */
        getCompletions: function(editor, session, pos, prefix, callback) {
            getCompletions(this, editor, session, pos, prefix, callback);
        },

        getHint: function(cm, c) {
            return hint(this, cm, c);
        },

        showType: function(cm, pos) {
            showType(this, cm, pos);
        },

        updateArgHints: function(cm) {
            // console.log('update arg hints',cm);
            updateArgHints(this, cm);
        },

        jumpToDef: function(cm) {
            jumpToDef(this, cm);
        },

        jumpBack: function(cm) {
            jumpBack(this, cm);
        },

        rename: function(cm) {
            rename(this, cm);
        },

        selectName: function(cm) {
            selectName(this, cm);
        },
        /**
         * Sends request to tern server
         * The guy who intially wrote this did a terrible job.. the request doesnt even get the editors current info for context
         */
        request: function(editor, query, c, pos) {
            var self = this;
            var doc = findDoc(this, editor);
            var request = buildRequest(this, doc, query, pos);

            this.server.request(request, function(error, data) {
                if (!error && self.options.responseFilter) data = self.options.responseFilter(doc, query, request, error, data);
                c(error, data);
            });
        },
        /**
         * returns true if tern should be enabled at current mode (checks for javascript mode or inside of javascript in html mode)
         */
        enabledAtCurrentLocation: function(editor) {
            return inJavascriptMode(editor);
        }
    };

    exports.TernServer = TernServer;
    //#endregion


    //#region TernServerPrivate

    /**
     * Finds document on the tern server
     * @param {TernServer} ts
     * @param  doc -(in CM, this is a CM doc object)
     * @param  [name] (in CM, this was undefined in my tests)
     */
    function findDoc(ts, doc, name) {
        for (var n in ts.docs) {
            var cur = ts.docs[n];
            if (cur.doc == doc) return cur;
        }
        //this appears to add doc to server if not already on server...
        if (!name) for (var i = 0;; ++i) {
            n = "[doc" + (i || "") + "]";
            if (!ts.docs[n]) {
                name = n;
                break;
            }
        }
        return ts.addDoc(name, doc);
    }

    /**
     * Converts ace CursorPosistion {row,column} to tern posistion {line,ch}
     */
    function toTernLoc(pos) {
        if (pos.row) {
            return {
                line: pos.row,
                ch: pos.column
            };
        }
        return pos;
    }

    /**
     * Converts tern location {line,ch} to ace posistion {row,column}
     */
    function toAceLoc(pos) {
        if (pos.line) {
            return {
                row: pos.line,
                column: pos.ch
            };
        }
        return pos;
    }

    /**
     * Build request to tern server
     * @param {TernDoc} doc - {doc: AceEditor, name: name of document, changed: {from:int, to:int}}
     */
    function buildRequest(ts, doc, query, pos) {
        /*
         * the doc passed here is {changed:null, doc:Editor, name: "[doc]"}
         * not the same as editor.getSession().getDocument() which is: {$lines: array}  (the actual document content
         */
        var files = [],
            offsetLines = 0,
            allowFragments = !query.fullDocs;
        if (!allowFragments) {
            delete query.fullDocs;
        }
        if (typeof query == "string") {
            query = {
                type: query
            };
        }

        // lineCharPositions makes the tern result a position instead of a file offset integer. From Tern: Offsets into a file can be either (zero-based) integers, or {line, ch} objects, where both line and ch are zero-based integers. Offsets returned by the server will be integers, unless the lineCharPositions field in the request was set to true, in which case they will be {line, ch} objects.

        query.lineCharPositions = true;

        //build the query start and end based on current cusor location of editor
        if (query.end == null) { //this is null for get completions
            var currentSelection = doc.doc.getSelectionRange(); //returns range: start{row,column}, end{row,column}
            query.end = toTernLoc(pos || currentSelection.end);
            if (currentSelection.start != currentSelection.end) {
                query.start = toTernLoc(currentSelection.start);
            }
        }

        // log('doc',doc);
        var startPos = query.start || query.end;
        if (doc.changed) {
            //doc > 250 lines & doNot allow fragments & less than 100 lines changed and something else....
            if (doc.doc.session.getLength() > bigDoc && allowFragments !== false && doc.changed.to - doc.changed.from < 100 && doc.changed.from <= startPos.line && doc.changed.to > query.end.line) {
                files.push(getFragmentAround(doc, startPos, query.end));
                query.file = "#0";
                var offsetLines = files[0].offsetLines;
                if (query.start != null) query.start = Pos(query.start.line - -offsetLines, query.start.ch);
                query.end = Pos(query.end.line - offsetLines, query.end.ch);
            }
            else {
                files.push({
                    type: "full",
                    name: doc.name,
                    text: docValue(ts, doc)
                });
                query.file = doc.name;
                doc.changed = null;
            }
        }
        else {
            query.file = doc.name;
        }

        //TODO: need to add tracking of changes , until then, always push this file
        /*  files.push({
            type: "full",
            name: doc.name,
            text: docValue(ts, doc)
        });
        query.file = doc.name;
        doc.changed = null;
        */


        //push changes of any docs on server that are NOT this doc so that they are up to date for tihs request
        for (var name in ts.docs) {
            var cur = ts.docs[name];
            if (cur.changed && cur != doc) {
                files.push({
                    type: "full",
                    name: cur.name,
                    text: docValue(ts, cur)
                });
                cur.changed = null;
            }
        }

        return {
            query: query,
            files: files
        };
    }

    /**
     * Used to get a fragment of the current document for updating the documents changes to push to the tern server (more efficient than pushing entire document on each change)
     */
    function getFragmentAround(data, start, end) {
        var editor = data.doc;
        var minIndent = null,
            minLine = null,
            endLine,
            tabSize = editor.session.$tabSize;
        for (var p = start.line - 1, min = Math.max(0, p - 50); p >= min; --p) {
            var line = editor.session.getLine(p),
                fn = line.search(/\bfunction\b/);
            if (fn < 0) continue;
            var indent = countColumn(line, null, tabSize);
            if (minIndent != null && minIndent <= indent) continue;
            minIndent = indent;
            minLine = p;
        }
        if (minLine == null) minLine = min;
        var max = Math.min(editor.session.getLength() - 1, end.line + 20);
        if (minIndent == null || minIndent == countColumn(editor.session.getLine(start.line), null, tabSize)) endLine = max;
        else for (endLine = end.line + 1; endLine < max; ++endLine) {
            var indent = countColumn(editor.session.getLine(endLine), null, tabSize);
            if (indent <= minIndent) break;
        }
        var from = Pos(minLine, 0);

        return {
            type: "part",
            name: data.name,
            offsetLines: from.line,
            text: editor.session.getTextRange({
                start: toAceLoc(from),
                end: toAceLoc(Pos(endLine, 0))
            })
        };
    }

    /**
     * Copied from CodeMirror source, used in getFragmentAround. Not exactly sure what this does
     */
    function countColumn(string, end, tabSize, startIndex, startValue) {
        if (end == null) {
            end = string.search(/[^\s\u00a0]/);
            if (end == -1) end = string.length;
        }
        for (var i = startIndex || 0, n = startValue || 0; i < end; ++i) {
            if (string.charAt(i) == "\t") n += tabSize - (n % tabSize);
            else ++n;
        }
        return n;
    }


    /**
     * Gets the text for a doc
     * @param {TernDoc} doc - {doc: AceEditor, name: name of document, changed: {from:int, to:int}}
     */
    function docValue(ts, doc) {
        var val = doc.doc.getValue();
        if (ts.options.fileFilter) val = ts.options.fileFilter(val, doc.name, doc.doc);
        return val;
    }

    /**
     * Gets a class name for icon based on type for completion popup
     */
    function typeToIcon(type) {
        var suffix;
        if (type == "?") suffix = "unknown";
        else if (type == "number" || type == "string" || type == "bool") suffix = type;
        else if (/^fn\(/.test(type)) suffix = "fn";
        else if (/^\[/.test(type)) suffix = "array";
        else suffix = "object";
        return cls + "completion " + cls + "completion-" + suffix;
    }

    //popup on select cant be bound until its created. This tracks if its bound
    var popupSelectBound = false;
    /**
     * called to get completions, equivalent to cm.tern.hint(ts,cm,c)
     * NOTE: current implmentation of this has this method being called by the language_tools as a completor
     */
    function getCompletions(ts, editor, session, pos, prefix, callback) {
    
        ts.request(editor, {
            type: "completions",
            types: true,
            origins: true,
            docs: true,
            filter: false
        },
    
        function(error, data) {
            if (error) {
                return showError(editor, error);
            }
            //map ternCompletions to correct format
            var ternCompletions= data.completions.map(function(item) {
                return {
                    /*add space before icon class so Ace Prefix doesnt mess with it*/
                    iconClass: " " + (item.guess ? cls + "guess" : typeToIcon(item.type)),
                    doc: item.doc,
                    type: item.type,
                    caption: item.name,
                    value: item.name,
                    score: 100,
                    meta: item.origin ? item.origin : "tern"
                };
            });
            
            
            //#region OtherCompletions
            var otherCompletions=[];
            //if basic auto completion is on, then get keyword completions that are not found in tern results
            if (editor.getOption('enableBasicAutocompletion') === true) {
                try{
                    otherCompletions= editor.session.$mode.getCompletions();
                }
                catch(ex){
                    //TODO: this throws error when using tern in script tags in mixed html mode- need to fix this(not critical, but missing keyword completions when using html mixed)
                }
            }
            
            //add local string completions if enabled, this is far more useful than the local text completions
            // gets string tokens that have no spaces or quotes that are longer than min length, tested on 5,000 line doc and takes about ~10ms
            var ternLocalStringMinLength = editor.getOption('ternLocalStringMinLength');
            if(ternLocalStringMinLength > 0){
                for (var i = 0; i < editor.session.getLength(); i++) {
                    var tokens = editor.session.getTokens(i);
                    for (var n = 0; n < tokens.length; n++) {
                        var t = tokens[n];
                        if (t.type === 'string') {
                            var val = t.value.toString().substr(1, t.value.length - 2).trim(); //remove first and last quotes
                            if (val.length >= ternLocalStringMinLength && val.indexOf(' ') ===-1 && val.indexOf('\'') ===-1 && val.indexOf('"') ===-1) {
                                var isDuplicate=false;
                                if(otherCompletions.length>0){
                                    for (var x = 0; x < otherCompletions.length; x++) {
                                        if (otherCompletions[x].value.toString() === val) {
                                            isDuplicate = true;
                                            break;
                                        }
                                    }
                                }
                                if(!isDuplicate){
                                    otherCompletions.push({
                                        meta: 'localString',
                                        name: val,
                                        value: val,
                                        score: -1
                                    });
                                }
                            }
                        }
                    }
                }
            }
            
            //now merge other completions with tern (tern has priority)
            //tested on 5,000 line doc with all other completions and takes about ~10ms
            if(otherCompletions.length>0){
                var mergedCompletions = ternCompletions.slice(); //copy array
                for (var n = 0; n < otherCompletions.length; n++) {
                    var b = otherCompletions[n];
                    var isDuplicate = false;
                    for (var i = 0; i < ternCompletions.length; i++) {
                        if (ternCompletions[i].value.toString() === b.value.toString()) {
                            isDuplicate = true;
                            break;
                        }
                    }
                    if (!isDuplicate) {
                        mergedCompletions.push(b);
                    }
                }
                ternCompletions = mergedCompletions.slice();
            }
            //#endregion
    
    
            //callback goes to the lang tools completor
            callback(null, ternCompletions);
    
            var tooltip = null;
            //COMEBACK: also need to bind popup close and update (update likely means when the tooltip has to move) (and hoever over items should move tooltip)
    
            if (!bindPopupSelect()) {
                popupSelectionChanged(); //call once if popupselect bound exited to show tooltip for first item
            }
    
            //binds popup selection change, which cant be done until first time popup is created
            function bindPopupSelect() {
                if (popupSelectBound) {
                    return false;
                }
                if (!editor.completer.popup) { //popup not opened yet
                    setTimeout(bindPopupSelect, 100); //try again in 100ms
                    return;
                }
                editor.completer.popup.on('select', popupSelectionChanged);
                editor.completer.popup.on('hide', function() {
                    closeAllTips();
                });
                popupSelectionChanged(); //fire once after first bind
                popupSelectBound = true; //prevent rebinding
            }
            //fired on popup selection change
    
            function popupSelectionChanged() {
                closeAllTips(); //remove(tooltip); //using close all , but its slower, comeback and remove single if its working right
                //gets data of currently selected completion
                var data = editor.completer.popup.getData(editor.completer.popup.getRow());
                //  logO(data, 'data');
                if (!data || !data.doc) { //no comments
                    return;
                }
                //make tooltip
                //return;
                var node = editor.completer.popup.renderer.getContainerElement();
                tooltip = makeTooltip(node.getBoundingClientRect().right + window.pageXOffset,
                node.getBoundingClientRect().top + window.pageYOffset, data.doc);
                tooltip.className += " " + cls + "hint-doc";
            }
        });
    }

    //#region ArgHints

    /**
     * If editor is currently inside of a function call, this will try to get definition of the function that is being called, if successfull will show tooltip about arguments for the function being called.
     * NOTE: did performance testing and found that scanning for callstart takes less than 1ms
     */
    function updateArgHints(ts, editor) {
        closeArgHints(ts);
        if (editor.getSession().getTextRange(editor.getSelectionRange()) !== '') {
            return; //something is selected
        }
        if (!inJavascriptMode(editor)) {
            return; //javascript mode only (need to comeback to make work while in javascipt inside of html)
        }

        var start = {}; //start of query to tern (start of the call location)
        var currentPosistion = editor.getSelectionRange().start; //{row,column}
        var currentLine = currentPosistion.row;
        var currentCol = currentPosistion.column;
        var firstLineToCheck = Math.max(0, currentLine - 6);
        //current character
        var ch = '';
        //current depth of the call based on parenthesis
        var depth = 0;
        //argument posistion
        var argpos = 0;
        //iterate backwards through each row
        for (var row = currentLine; row >= firstLineToCheck; row--) {
            var thisRow = editor.session.getLine(row);
            if (row === currentLine) {
                thisRow = thisRow.substr(0, currentCol);
            } //for current line, only get up to cursor posistion
            for (var col = thisRow.length; col >= 0; col--) {
                ch = thisRow.substr(col, 1);
                if (ch === '}' || ch === ')' || ch === ']') {
                    depth += 1;
                }
                else if (ch === '{' || ch === '(' || ch === '[') {
                    if (depth > 0) {
                        depth -= 1;
                    }
                    else if (ch === '(') {
                        //check before call start to make sure its not a function definition
                        var wordBeforeFnName = thisRow.substr(0, col).split(' ').reverse()[1];
                        if (wordBeforeFnName && wordBeforeFnName.toLowerCase() === 'function') {
                            break;
                        }
                        //Make sure this is not in a comment or start of a if statement
                        var token = editor.session.getTokenAt(row, col);
                        if(token){
                            if(token.type.toString().indexOf('comment') !== -1 || token.type ==='keyword'){
                                break;
                            }
                        }
                        start = {
                            line: row,
                            ch: col
                        };
                        break;
                    }
                    else {
                        break;
                    }
                }
                else if (ch === ',' && depth === 0) {
                    argpos += 1;
                }
            }
        }
        if (!start.hasOwnProperty('line')) { //start not found
            return;
        }
        start = toTernLoc(start); //convert

        //check for arg hints for the same call start, if found, then use them but update the argPos (occurs when moving between args in same call)
        var cache = ts.cachedArgHints;
        if (cache && cache.doc == editor && cmpPos(start, cache.start) === 0) {
            return showArgHints(ts, editor, argpos);
        }

        //still going: get arg hints from server
        ts.request(editor, {
            type: "type",
            preferFunction: true,
            end: start
        }, function(error, data) {
            if (error) {
                return showError(editor, error);
            }
            if (error || !data.type || !(/^fn\(/).test(data.type)) {
                return;
            }
            ts.cachedArgHints = {
                start: start,
                type: parseFnType(data.type),
                name: data.exprName || data.name || "fn",
                guess: data.guess,
                doc: editor
            };
            showArgHints(ts, editor, argpos);
        });
    }

    /**
     * Displays argument hints as tooltip
     * @param {int} pos - index of the current parameter that the cursor is located at (inside of parameters)
     */
    function showArgHints(ts, editor, pos) {
        closeArgHints(ts);
        var cache = ts.cachedArgHints,
            tp = cache.type;
        var tip = elt("span", cache.guess ? cls + "fhint-guess" : null,
        elt("span", cls + "fname", cache.name), "(");
        for (var i = 0; i < tp.args.length; ++i) {
            if (i) tip.appendChild(document.createTextNode(", "));
            var arg = tp.args[i];
            tip.appendChild(elt("span", cls + "farg" + (i == pos ? " " + cls + "farg-current" : ""), arg.name || "?"));
            if (arg.type != "?") {
                tip.appendChild(document.createTextNode(":\u00a0"));
                tip.appendChild(elt("span", cls + "type", arg.type));
            }
        }
        tip.appendChild(document.createTextNode(tp.rettype ? ") ->\u00a0" : ")"));
        if (tp.rettype) tip.appendChild(elt("span", cls + "type", tp.rettype));

        //TODO: see ace source (master)- demo/kitchen-sink/token_tooltip.js to get better way to handle the tooltips!

        //get cursor location- there is likely a better way to do this...
        var place = editor.renderer.$cursorLayer.getPixelPosition(); //this gets left correclty, but not top if there is scrolling
        place.top = editor.renderer.$cursorLayer.cursors[0].offsetTop; //this gets top correctly regardless of scrolling, but left is not correct

        place.top += editor.renderer.scroller.getBoundingClientRect().top; //top offset of editor on page
        ts.activeArgHints = makeTooltip(place.left + 45, place.top + 17, tip);

        /*   COMEBACK-- add remove tip on scroll
            //added by morgan
            function clear() {
                cm.off("scroll", clear);
                if (!ts.activeArgHints) {
                    return;
                }
                closeArgHints(ts);
            }
            editor.on("scroll", clear);
            */
    }

    function parseFnType(text) {
        var args = [],
            pos = 3;

        function skipMatching(upto) {
            var depth = 0,
                start = pos;
            for (;;) {
                var next = text.charAt(pos);
                if (upto.test(next) && !depth) return text.slice(start, pos);
                if (/[{\[\(]/.test(next))++depth;
                else if (/[}\]\)]/.test(next))--depth;
                ++pos;
            }
        }

        // Parse arguments
        if (text.charAt(pos) != ")") for (;;) {
            var name = text.slice(pos).match(/^([^, \(\[\{]+): /);
            if (name) {
                pos += name[0].length;
                name = name[1];
            }
            args.push({
                name: name,
                type: skipMatching(/[\),]/)
            });
            if (text.charAt(pos) == ")") break;
            pos += 2;
        }

        var rettype = text.slice(pos).match(/^\) -> (.*)$/);
        //logO(args, 'args'); logO(rettype, 'rettype');//nothing
        return {
            args: args,
            rettype: rettype && rettype[1]
        };
    }

    //#endregion


    //#region tooltips

    /**
     * returns the difference of posistion a - posistion b (returns difference in line if any, then difference in ch if any)
     * Will return 0 if posistions are the same; (note: automatically converts to ternPosistion)
     * @param {line,ch | row,column} a - first posistion
     * @param {line,ch | row,column} b - second posistion
     */
    function cmpPos(a, b) {
        //if lines matches (result is 0), then returns difference in character
        a = toTernLoc(a);
        b = toTernLoc(b);
        return a.line - b.line || a.ch - b.ch;
    }

    function dialog(cm, text, f) {
        alert('need to implment dialog');
    }

    function elt(tagname, cls /*, ... elts*/ ) {
        var e = document.createElement(tagname);
        if (cls) e.className = cls;
        for (var i = 2; i < arguments.length; ++i) {
            var elt = arguments[i];
            if (typeof elt == "string") elt = document.createTextNode(elt);
            e.appendChild(elt);
        }
        return e;
    }
    /**
     *Closes any open tooltips
     */

    function closeAllTips() {
        var tips = document.querySelectorAll('.' + cls + 'tooltip');
        if (tips.length > 0) {
            for (var i = 0; i < tips.length; i++) {
                remove(tips[i]);
            }
        }
    }

    function tempTooltip(cm, content, int_timeout) {
        alert('need to implement tempTooltip');
        return;
        //change by morgan: hide tip on scroll and longer timeout for fading of tip by default
        var where = cm.cursorCoords();
        var tip = makeTooltip(where.right + 1, where.bottom, content);

        function clear() {
            if (!tip.parentNode) return;
            cm.off("cursorActivity", clear);
            cm.off("scroll", clear);
            fadeOut(tip, int_timeout);
        }
        if (!int_timeout) {
            int_timeout = 3000;
        }
        if (int_timeout !== -1) {
            setTimeout(clear, int_timeout);
        }
        cm.on("cursorActivity", clear);
        cm.on("scroll", clear);
    }

    function makeTooltip(x, y, content) {
        var node = elt("div", cls + "tooltip", content);
        node.style.left = x + "px";
        node.style.top = y + "px";
        document.body.appendChild(node);
        return node;
    }

    function remove(node) {
        var p = node && node.parentNode;
        if (p) p.removeChild(node);
    }

    //modified by morgan
    function fadeOut(tooltip, int_timeout) {
        if (!int_timeout) {
            int_timeout = 1100;
        }
        if (int_timeout === -1) {
            remove(tooltip);
            return;
        }
        tooltip.style.opacity = "0";
        setTimeout(function() {
            remove(tooltip);
        }, int_timeout);
    }

    function showError(cm, msg) {
        setTimeout(function() {
            throw new Error('tern error: ' + msg);
        }, 0);
    }

    function closeArgHints(ts) {
        if (ts.activeArgHints) {
            remove(ts.activeArgHints);
            ts.activeArgHints = null;
        }
    }

    //#endregion


    //#region JumpTo

    // NOT CONVERTED
    function jumpToDef(ts, editor) {
        function inner(varName) {
            var req = {
                type: "definition",
                variable: varName || null
            };
            var doc = findDoc(ts, editor);


            //BUILD REQUEST -- this builds the query to send to tern (query has the node defnition that we are looking for, so buidRequest must look at codemirrot and find the object the cursor is on and then looks for it)
            //  logO(buildRequest(ts, doc, req), 'buildRequest result that is sent to tern') //NEVERMIND- this contains the line position currently, but it does NOT contain the node definition we are looking for

            //this calls  function findDef(srv, query, file) {
            ts.server.request(buildRequest(ts, doc, req), function(error, data) {
                if (error) return showError(ts, editor, error);
                if (!data.file && data.url) {
                    window.open(data.url);
                    return;
                }
                DBG(arguments, true);
                if (data.file) {
                    var localDoc = ts.docs[data.file];
                    var found;
                    // logO(localDoc.doc, 'localDoc.doc'); logO(data, 'data');
                    if (localDoc && (found = findContext(localDoc.doc, data))) {
                        ts.jumpStack.push({
                            file: doc.name,
                            start: toTernLoc(editor.getSelectionRange().start), //editor.getCursor("from"), (not sure if correct)
                            end: toTernLoc(editor.getSelectionRange().end) //editor.getCursor("to")
                        });
                        moveTo(ts, doc, localDoc, found.start, found.end);
                        return;
                    }
                }
                showError(ts, editor, "Could not find a definition.");
            });
        }

        if (!atInterestingExpression(editor)) dialog(editor, "Jump to variable", function(name) {
            if (name) inner(name);
        });
        else inner();
    }
    // NOT CONVERTED
    function jumpBack(ts, cm) {
        var pos = ts.jumpStack.pop(),
            doc = pos && ts.docs[pos.file];
        if (!doc) return;
        moveTo(ts, findDoc(ts, cm.getDoc()), doc, pos.start, pos.end);
    }
    // NOT CONVERTED
    function moveTo(ts, curDoc, doc, start, end) {
        var sel = curDoc.doc.getSession().getSelection(); // sel.selectionLead.setPosistion();// sel.selectionAnchor.setPosistion();
        sel.setSelectionRange({
            start: toAceLoc(start),
            end: toAceLoc(end)
        });
        //doc.doc.setSelection(end, start);

        if (curDoc != doc) {
            if (ts.options.switchToDoc) {
                closeArgHints(ts);
                //logO(doc, 'moveto.doc');logO(start, 'moveto.start'); logO(end, 'moveto.end');
                //5.23.2014- added start  parameter to pass to child
                //console.log(ts.options.switchToDoc, start);
                ts.options.switchToDoc(doc.name, start);
            }
            else {
                showError(ts, curDoc.doc, 'Need to add editor.ternServer.options.switchToDoc to jump to another document');
            }
        }
    }

    /**
     * Dont know what this does yet...
     * Marijnh's comment: The {line,ch} representation of positions makes this rather awkward.
     * @param {object} data - contains documentation for function, start, end, file, context, contextOffset, origin
     */
    function findContext(editor, data) {
        // logO(editor, 'editor'); logO(data, 'data');
        //DBG(arguments, true);
        var before = data.context.slice(0, data.contextOffset).split("\n");
        var startLine = data.start.line - (before.length - 1);
        var start = Pos(startLine, (before.length == 1 ? data.start.ch : editor.session.getLine(startLine).length) - before[0].length);

        var text = editor.session.getLine(startLine).slice(start.ch);
        for (var cur = startLine + 1; cur < editor.session.getLength() && text.length < data.context.length; ++cur)
        text += "\n" + editor.session.getLine(cur);
        if (text.slice(0, data.context.length) == data.context) return data;

        //COMEBACK--- need to use editor.find
        console.log(new Error('This part is not complete, need to implement using Ace\'s search functionality'));
        var cursor = editor.getSearchCursor(data.context, 0, false);
        var nearest, nearestDist = Infinity;
        while (cursor.findNext()) {
            var from = cursor.from(),
                dist = Math.abs(from.line - start.line) * 10000;
            if (!dist) dist = Math.abs(from.ch - start.ch);
            if (dist < nearestDist) {
                nearest = from;
                nearestDist = dist;
            }
        }
        if (!nearest) return null;

        if (before.length == 1) nearest.ch += before[0].length;
        else nearest = Pos(nearest.line + (before.length - 1), before[before.length - 1].length);
        if (data.start.line == data.end.line) var end = Pos(nearest.line, nearest.ch + (data.end.ch - data.start.ch));
        else var end = Pos(nearest.line + (data.end.line - data.start.line), data.end.ch);
        return {
            start: nearest,
            end: end
        };
    }
    /**
     * (not exactly sure)
     */
    function atInterestingExpression(editor) {
        var pos = editor.getSelectionRange().end; //editor.getCursor("end"),
        var tok = editor.session.getTokenAt(pos.row, pos.column); // editor.getTokenAt(pos);
        pos = toTernLoc(pos);
        if (tok.start < pos.ch && (tok.type == "comment" || tok.type == "string")) {
            // log('not atInterestingExpression');
            return false;
        }
        return /\w/.test(editor.session.getLine(pos.line).slice(Math.max(pos.ch - 1, 0), pos.ch + 1));
        //return /\w/.test(editor.getLine(pos.line).slice(Math.max(pos.ch - 1, 0), pos.ch + 1));
    }

    // Variable renaming NOT CONVERTED
    function rename(ts, cm) {
        var token = cm.getTokenAt(cm.getCursor());
        if (!/\w/.test(token.string)) showError(ts, cm, "Not at a variable");
        dialog(cm, "New name for " + token.string, function(newName) {
            ts.request(cm, {
                type: "rename",
                newName: newName,
                fullDocs: true
            }, function(error, data) {
                if (error) return showError(ts, cm, error);
                applyChanges(ts, data.changes);
            });
        });
    }

    //Find references ADDED BY MORGAN- NOT CONVERTED
    function findRefs(ts, cm) {
        var token = cm.getTokenAt(cm.getCursor());
        if (!/\w/.test(token.string)) showError(ts, cm, "Not at a variable");
        ts.request(cm, {
            type: "refs",
            fullDocs: true
        }, function(error, data) {
            if (error) return showError(ts, cm, error);
            //data comes back with name,type,refs{start(ch,line),end(ch,line),file},
            var r = data.name + '(' + data.type + ') References \n-----------------------------------------';
            if (!data.refs || data.refs.length === 0) {
                r += '<br/>' + 'No references found';
            }
            for (var i = 0; i < data.refs.length; i++) {
                var tmp = data.refs[i];
                try {
                    r += '\n' + tmp.file + ' - line: ' + tmp.start.line + ' ch: ' + tmp.start.ch;
                }
                catch (ex) {
                    setTimeout(function() {
                        throw ex;
                    }, 0);
                }
            }
            //log(r);
            closeAllTips();
            tempTooltip(cm, r, - 1);
        });
    }

    //#endregion


    /**
     * returns true if current mode is javascript;
     *  TO- make sure tern can work in mixed html mode
     */
    function inJavascriptMode(editor) {
        return getCurrentMode(editor) == 'javascript';
    }

    /**
     * Gets editors mode at cursor posistion (including nested mode) (copied from snipped manager)     *
     */
    function getCurrentMode(editor) {
        var scope = editor.session.$mode.$id || "";
        scope = scope.split("/").pop();
        if (scope === "html" || scope === "php") {
            if (scope === "php") scope = "html";
            var c = editor.getCursorPosition()
            var state = editor.session.getState(c.row);
            if (typeof state === "object") {
                state = state[0];
            }
            if (state.substring) {
                if (state.substring(0, 3) == "js-") scope = "javascript";
                else if (state.substring(0, 4) == "css-") scope = "css";
                else if (state.substring(0, 4) == "php-") scope = "php";
            }
        }
        return scope;
    }



    function startsWith(str, token) {
        return str.slice(0, token.length).toUpperCase() == token.toUpperCase();
    }


    function trackChange(ts, doc, change) {
        //log('trackChange');
        //var data = findDoc(editor);

        //var argHints = cachedArgHints;
        //TODO
        //if (argHints && argHints.doc == doc && cmpPos(argHints.start, change.to) <= 0)
        //  cachedArgHints = null;
        //DBG(arguments, true);

        /*log('change', change);
          { change=
	        "data": {
		        "action": "removeText" OR  "insertText",
		        "range": {
			        "start": {
				        "row": 14,
				        "column": 21
			        },
			        "end": {
				        "row": 14,
				        "column": 22
			        }
		        },
		        "text": "0"     -- the text that was changed
	        }
         */

        //log('doc', doc);
        //log('change', change);

        //NOTE get value: editor.ternServer.docs['[doc]'].doc.session.getValue()

        //convert ace Change event to object that is used in logic below
        var _change = {};
        _change.from = toTernLoc(change.data.range.start);
        _change.to = toTernLoc(change.data.range.end);
        if (change.data.hasOwnProperty('text')) {
            _change.text = [change.data.text];
        }
        else { //text not set when multiple lines changed, instead lines is set as array
            _change.text = change.data.lines;
        }


        var data = findDoc(ts, doc);
        //log('data', data);//-- gets current doc on tern server, value can be otained by : data.doc.session.getValue()
        var argHints = ts.cachedArgHints;

        if (argHints && argHints.doc == doc && cmpPos(argHints.start, _change.to) <= 0) {
            ts.cachedArgHints = null;
            //log('removing cached arg hints');
        }

        var changed = data.changed; //data is the tern server doc, which keeps a changed property, which is null here
        if (changed === null) {
            //log('changed is null');
            data.changed = changed = {
                from: _change.from.line,
                to: _change.from.line
            };
        }
        // log('_change', _change, 'changed', changed);

        var end = _change.from.line + (_change.text.length - 1);
        if (_change.from.line < changed.to) {
            changed.to = changed.to - (_change.to.line - end);
        }
        if (end >= changed.to) {
            changed.to = end + 1;
        }
        if (changed.from > _change.from.line) {
            changed.from = changed.from.line;
        }
        //if doc is > 250 lines & more than 100 lines changed, then update entire doc on tern server after 200ms.. not sure why the delay
        if (doc.session.getLength() > bigDoc && _change.to - changed.from > 100) {
            setTimeout(function() {
                if (data.changed && data.changed.to - data.changed.from > 100) {
                    sendDoc(ts, data);
                }
            }, 200);
        }
    }

    //#endregion


    //#region WorkerWrapper
    // Worker wrapper

    function WorkerServer(ts) {
        var worker = new Worker(ts.options.workerScript);
        worker.postMessage({
            type: "init",
            defs: ts.options.defs,
            plugins: ts.options.plugins,
            scripts: ts.options.workerDeps
        });
        var msgId = 0,
            pending = {};

        function send(data, c) {
            if (c) {
                data.id = ++msgId;
                pending[msgId] = c;
            }
            worker.postMessage(data);
        }
        worker.onmessage = function(e) {
            var data = e.data;
            if (data.type == "getFile") {
                getFile(ts, data.name, function(err, text) {
                    send({
                        type: "getFile",
                        err: String(err),
                        text: text,
                        id: data.id
                    });
                });
            }
            else if (data.type == "debug") {
                console.log(data.message);
            }
            else if (data.id && pending[data.id]) {
                pending[data.id](data.err, data.body);
                delete pending[data.id];
            }
        };
        worker.onerror = function(e) {
            for (var id in pending) pending[id](e);
            pending = {};
        };

        this.addFile = function(name, text) {
            send({
                type: "add",
                name: name,
                text: text
            });
        };
        this.delFile = function(name) {
            send({
                type: "del",
                name: name
            });
        };
        this.request = function(body, c) {
            send({
                type: "req",
                body: body
            }, c);
        };
        //sets defs (pass array of strings, valid defs are jquery, underscore, browser, ecma5)
        //COMEBACK-- this doesnt work yet
        this.setDefs = function(arr_defs) {
            send({
                type: "setDefs",
                defs: arr_defs
            });
        }
    }
    //#endregion


    //#region CSS
    var dom = require("ace/lib/dom");

    dom.importCssString(".Ace-Tern-completion { padding-left: 12px; position: relative; }  .Ace-Tern-completion:before { position: absolute; left: 0px; bottom: 0px;  border-radius: 50%; font-size: 12px; font-weight: bold; height: 13px; width: 13px; font-size:11px;  /*BYM*/  line-height: 14px;  text-align: center; color: white; -moz-box-sizing: border-box; box-sizing: border-box; }  .Ace-Tern-completion-unknown:before { content: \"?\"; background: #4bb; }  .Ace-Tern-completion-object:before { content: \"O\"; background: #77c; }  .Ace-Tern-completion-fn:before { content: \"F\"; background: #7c7; }  .Ace-Tern-completion-array:before { content: \"A\"; background: #c66; }  .Ace-Tern-completion-number:before { content: \"1\"; background: #999; }  .Ace-Tern-completion-string:before { content: \"S\"; background: #999; }  .Ace-Tern-completion-bool:before { content: \"B\"; background: #999; }  .Ace-Tern-completion-guess { color: #999; }  .Ace-Tern-tooltip { border: 1px solid silver; border-radius: 3px; color: #444; padding: 2px 5px; font-size: 90%; font-family: monospace; background-color: white; white-space: pre-wrap; max-width: 40em; position: absolute; z-index: 10; -webkit-box-shadow: 2px 3px 5px rgba(0,0,0,.2); -moz-box-shadow: 2px 3px 5px rgba(0,0,0,.2); box-shadow: 2px 3px 5px rgba(0,0,0,.2); transition: opacity 1s; -moz-transition: opacity 1s; -webkit-transition: opacity 1s; -o-transition: opacity 1s; -ms-transition: opacity 1s; }  .Ace-Tern-hint-doc { max-width: 25em; }  .Ace-Tern-fname { color: black; }  .Ace-Tern-farg { color: #70a; }  .Ace-Tern-farg-current {font-weight:bold; color:magenta; }  .Ace-Tern-type { color: #07c; }  .Ace-Tern-fhint-guess { opacity: .7; }");

    //override the autocomplete width (ghetto)-- need to make this an option
    dom.importCssString(".ace_autocomplete {width: 400px !important;}");

    //#endregion
});