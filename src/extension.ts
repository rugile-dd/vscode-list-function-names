import * as vscode from 'vscode';
import SymbolKinds from './SymbolKinds';

function processNodes(symbols: vscode.DocumentSymbol[], depth: number, lines: string[]): string {
  let result = '';
  for (const symbol of symbols) {
    const tabs = [...new Array(depth)].reduce((a, b) => a + '\t', '');
    const privateReg = /\bprivate\b/;
    const publicReg = /\bpublic\b/;
    const line = lines[symbol.selectionRange.start.line];
    const privacy = privateReg.exec(line) ? 'private ' : publicReg.exec(line) ? 'public ' : '';
    result += `${tabs}${privacy}${SymbolKinds[symbol.kind]} ${symbol.name}\n`;
    if (symbol.children) {
      result += processNodes(symbol.children, depth + 1, lines);
    }
  }

  return result;
}

const getRelativeFilePath = (uri: vscode.Uri) => {
  const workspacePath = vscode.workspace.getWorkspaceFolder(uri)?.uri.path as string;
  let folderPath = uri.path.replace(workspacePath, '');
  if (folderPath.indexOf('/') === 0) {
    folderPath = folderPath.substring(1);
  }
  return folderPath;
};

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.commands.registerCommand('extension.listSymbols', () => {
    if (!vscode.window.activeTextEditor) {
      vscode.window.showWarningMessage('There must be an active text editor');
      return;
    }

    const fileLines = vscode.window.activeTextEditor.document.getText().split('\n');

    (vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', vscode.Uri.file(vscode.window.activeTextEditor.document.fileName)) as Thenable<vscode.DocumentSymbol[]>)
      .then((symbols: vscode.DocumentSymbol[]) => {
        const text = processNodes(symbols, 0, fileLines);
        vscode.workspace.openTextDocument({ content: text }).then(doc => {
          vscode.window.showTextDocument(doc);
        });
      });
	}));

  context.subscriptions.push(vscode.commands.registerCommand('extension.listAllSymbolsInFolder', (fileMeta) => {
    const folderPath = getRelativeFilePath(fileMeta);

    // TODO: Make a config so that users can choose to exclude files with a glob
    vscode.workspace.findFiles(`${folderPath}/**`, undefined, undefined).then(uris => {
      const promises = [];
      for (const uri of uris) {
        const p = new Promise<{ symbols: vscode.DocumentSymbol[], fileUri: vscode.Uri, fileText: string } | undefined>((resolve) => {
          vscode.workspace.openTextDocument(uri).then(document => {
            const fileText = document.getText();
            (vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', uri) as Thenable<vscode.DocumentSymbol[]>).then(symbols => {
              if (!symbols) resolve(undefined);
              resolve({
                fileText,
                fileUri: uri,
                symbols
              });
            }, _ => {
              resolve(undefined);
            });
          });
        });
        promises.push(p);
      }
      Promise.all(promises).then(allSymbols => {
        let fullText = '';
        const filtered = allSymbols.filter(s => typeof s !== 'undefined') as { symbols: vscode.DocumentSymbol[]; fileUri: vscode.Uri; fileText: string; }[];
        for (const fileSymbols of filtered) {
          fullText += `${getRelativeFilePath(fileSymbols.fileUri)}\n---\n`;
          fullText += processNodes(fileSymbols.symbols, 0, fileSymbols.fileText.split('\n'));
          fullText += '\n';
        }

        vscode.workspace.openTextDocument({ content: fullText }).then(doc => {
          vscode.window.showTextDocument(doc);
        });
      });
    });
  }));
}
