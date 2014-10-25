
#LEFTOFF

- requirejs is not working correctly.. need to figure out why





##NOTES

- have not copied over the new version of ext-tern.js because I want to test other things first
-
- CodeMirror.Doc (which is whats passed to tern server):
       Each editor is associated with an instance of CodeMirror.Doc, its document. A document represents the editor content, plus a selection, an undo history, and a mode. A document can only be associated with a single editor at a time. You can create new documents by calling the CodeMirror.Doc(text, mode, firstLineNumber) constructor. The last two arguments are optional and can be used to set a mode for the document and make it start at a line number other than 0, respectively. http://codemirror.net/doc/manual.html#api_doc

- Ace Edit Session: Stores all the data about Editor state providing easy way to change editors state. EditSession can be attached to only one Document. Same Document can be attached to several EditSessions. http://ace.c9.io/#nav=api&api=edit_session.
- https://github.com/ajaxorg/ace/wiki/Embedding-API
 

Ace keeps all the editor states (selection, scroll position, etc.) in editor.session, which is very useful for making a tabbed editor:

var EditSession = require("ace/edit_session").EditSession
var js = new EditSession("some js code")
var css = new EditSession(["some", "css", "code here"])
// and then to load document into editor, just call
editor.setSession(js)


IT APPEARS THAT CODEMIRROR.DOC AND ACE.EDITSESSION ARE THE SAME THING (OR CLOSE TO IT)
There is also ace.document: Contains the text of the document. Document can be attached to several EditSessions.--this is different from CM.Doc

#gotit:
    CodeMirror.tern works by passing the CodeMirror instance to functions that require it, and the CodeMirror.Doc to functions that dont need the instance
    - paralel: Ace should pass the editor instance to some functions, and the edit session to others
    - NOTE: the codeMirror doc has a property 'cm' that contains the editor instance that is holding that doc...
            but it doesnt appear to be used by the plugin
            this would be the equivalent of adding the editor instance to the edit session (could do this if needed)

- might need to add the current editor to the edit session

