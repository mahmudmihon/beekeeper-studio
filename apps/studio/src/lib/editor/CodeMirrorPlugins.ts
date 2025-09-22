import { Extension, StateField } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { autocompletion, CompletionContext, CompletionResult, startCompletion } from "@codemirror/autocomplete";
import { removeQueryQuotes } from "@/lib/db/sql_tools";
import MagicColumnBuilder from "@/lib/magic/MagicColumnBuilder";
import rawLog from "@bksLogger";
import { TableOrView } from "../db/models";
import _ from "lodash";

export function findSqlQueryIdentifierDialect(connectionType: string) {
  const mappings = {
    sqlserver: "mssql",
    sqlite: "sqlite",
    cockroachdb: "psql",
    postgresql: "psql",
    mysql: "mysql",
    mariadb: "mysql",
    tidb: "mysql",
    redshift: "psql",
  };
  return mappings[connectionType] || "generic";
}

// CM6 Extension for autoquote functionality
export function autoquoteExtension(): Extension {
  return EditorView.updateListener.of((update) => {
    if (!update.docChanged) return;
    
    const view = update.view;
    
    update.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
      const text = inserted.toString();
      
      // Only process completion-originated changes
      if (text && update.transactions.some(tr => tr.isUserEvent("input.complete"))) {
        // Check if the text needs quoting
        const needsQuoting = /[^a-z0-9_]/.test(text) && !/^".*"$/.test(text);
        
        if (needsQuoting) {
          const quotedText = `"${text}"`;
          view.dispatch({
            changes: { from: fromB, to: toB, insert: quotedText }
          });
        }
      }
    });
  });
}

// CM6 Extension for paste handler to remove query quotes
export function removeQueryQuotesExtension(connectionType: string): Extension {
  const dialect = findSqlQueryIdentifierDialect(connectionType);
  
  return EditorView.domEventHandlers({
    paste(event, view) {
      event.preventDefault();
      const clipboard = event.clipboardData?.getData("text")?.trim() || "";
      const cleanedClipboard = removeQueryQuotes(clipboard, dialect);
      
      const selection = view.state.selection.main;
      view.dispatch({
        changes: {
          from: selection.from,
          to: selection.to,
          insert: cleanedClipboard
        },
        selection: { anchor: selection.from + cleanedClipboard.length }
      });
      
      return true;
    }
  });
}

// CM6 Extension for query magic functionality
export function queryMagicExtension(
  defaultSchemaGetter: () => string,
  tablesGetter: () => TableOrView[]
): Extension {
  const log = rawLog.scope("CodeMirrorPlugins:QueryMagic");
  
  return autocompletion({
    override: [
      (context: CompletionContext): CompletionResult | null => {
        const { state, pos } = context;
        const line = state.doc.lineAt(pos);
        const lineText = line.text;
        const lineStart = line.from;
        const cursorInLine = pos - lineStart;
        
        // Find word at cursor
        let wordStart = cursorInLine;
        let wordEnd = cursorInLine;
        
        // Find start of word
        while (wordStart > 0 && /\w/.test(lineText[wordStart - 1])) {
          wordStart--;
        }
        
        // Find end of word
        while (wordEnd < lineText.length && /\w/.test(lineText[wordEnd])) {
          wordEnd++;
        }
        
        const word = lineText.slice(wordStart, wordEnd);
        
        if (!word.includes("__")) return null;
        
        const defSchema = defaultSchemaGetter();
        const suggestions = MagicColumnBuilder.suggestWords(
          word,
          tablesGetter(),
          defSchema
        );
        
        log.debug("suggestions for ", word, suggestions);
        
        if (!suggestions || suggestions.length === 0) return null;
        
        const options = suggestions.map((s) => {
          const parts = word.split("__");
          parts[parts.length - 1] = s;
          return {
            label: s,
            apply: parts.join("__"),
            type: "variable"
          };
        });
        
        return {
          from: lineStart + wordStart,
          to: lineStart + wordEnd,
          options
        };
      }
    ]
  });
}

// CM6 Extension for autocomplete functionality
export function autocompleteExtension(): Extension {
  return [
    autocompletion({
      activateOnTyping: true,
      closeOnBlur: true
    }),
    keymap.of([
      {
         key: ".",
         run: (view) => {
           // Trigger autocomplete on period
           return startCompletion(view);
         }
       },
      {
        key: " ",
        run: (view) => {
          const { state } = view;
          const pos = state.selection.main.head;
          const line = state.doc.lineAt(pos);
          const lineText = line.text;
          const cursorInLine = pos - line.from;
          
          // Check for trigger words before space
          const triggerWords = ["from", "join"];
          const beforeCursor = lineText.slice(0, cursorInLine);
          const words = beforeCursor.trim().split(/\s+/);
          const lastWord = words[words.length - 1]?.toLowerCase();
          
          if (triggerWords.includes(lastWord)) {
            // Insert space first
            view.dispatch({
              changes: { from: pos, insert: " " },
              selection: { anchor: pos + 1 }
            });
            
            // Then trigger autocomplete
             setTimeout(() => {
               startCompletion(view);
             }, 0);
             
             return true;
           }
           
           return false;
         }
       },
       {
         key: "Backspace",
         run: (view) => {
           const { state } = view;
           const pos = state.selection.main.head;
           const line = state.doc.lineAt(pos);
           const lineText = line.text;
           const cursorInLine = pos - line.from;
           
           // Check if we're in a table name selection context
           const beforeCursor = lineText.slice(0, cursorInLine);
           const fromRegex = /\b(from|join)\s+[\w\d_."]*$/i;
           
           if (fromRegex.test(beforeCursor)) {
             // Let default backspace happen first
             setTimeout(() => {
               startCompletion(view);
             }, 0);
           }
           
           return false; // Let default backspace behavior continue
         }
       },
       {
         key: "Delete",
         run: (view) => {
           const { state } = view;
           const pos = state.selection.main.head;
           const line = state.doc.lineAt(pos);
           const lineText = line.text;
           const cursorInLine = pos - line.from;
           
           // Check if we're in a table name selection context
           const beforeCursor = lineText.slice(0, cursorInLine);
           const fromRegex = /\b(from|join)\s+[\w\d_."]*$/i;
           
           if (fromRegex.test(beforeCursor)) {
             // Let default delete happen first
             setTimeout(() => {
               startCompletion(view);
             }, 0);
           }
           
           return false; // Let default delete behavior continue
         }
       }
    ])
  ];
}

// CM6 Extension for undo handler
export function undoHandlerExtension(): Extension {
  return EditorView.updateListener.of((update) => {
    if (!update.docChanged) return;
    
    const view = update.view;
    
    // Check if this was an undo operation
    const isUndo = update.transactions.some(tr => 
      tr.isUserEvent("undo")
    );
    
    if (isUndo) {
      setTimeout(() => {
        const { state } = view;
        const pos = state.selection.main.head;
        const line = state.doc.lineAt(pos);
        const lineText = line.text;
        const cursorInLine = pos - line.from;
        
        // Check if we're in a table name selection context
        const beforeCursor = lineText.slice(0, cursorInLine);
        const fromRegex = /\b(from|join)\s+[\w\d_."]*$/i;
        
        if (fromRegex.test(beforeCursor)) {
          startCompletion(view);
        }
      }, 100);
    }
  });
}

// Factory functions for creating extensions
export function createAutoquoteExtension(): Extension {
  return autoquoteExtension();
}

export function createRemoveQueryQuotesExtension(connectionType: string): Extension {
  return removeQueryQuotesExtension(connectionType);
}

export function createQueryMagicExtension(
  defaultSchemaGetter: () => string,
  tablesGetter: () => TableOrView[]
): Extension {
  return queryMagicExtension(defaultSchemaGetter, tablesGetter);
}

export function createAutocompleteExtension(): Extension {
  return [
    autocompleteExtension(),
    undoHandlerExtension()
  ];
}

export default {
  createAutoquoteExtension,
  createAutocompleteExtension,
  createRemoveQueryQuotesExtension,
  createQueryMagicExtension
};
