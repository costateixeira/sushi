import { TextLocation } from '../fshtypes';
import { Recognizer, Token } from 'antlr4';
import { logger } from '../utils/FSHLogger';
import { ErrorListener } from 'antlr4/error';

export class FSHErrorListener extends ErrorListener {
  constructor(readonly file: string) {
    super();
  }

  syntaxError(
    recognizer: Recognizer,
    offendingSymbol: Token,
    line: number,
    column: number,
    msg: string
  ): void {
    const { message, location } = this.buildErrorMessage(
      recognizer,
      offendingSymbol,
      line,
      column,
      msg
    );
    logger.error(message, { file: this.file, location });
  }

  buildErrorMessage(
    recognizer: Recognizer,
    offendingSymbol: Token,
    line: number,
    column: number,
    msg: string
  ): { message: string; location: TextLocation } {
    let message = msg;
    let location: TextLocation = {
      startLine: line,
      startColumn: column + 1,
      endLine: line,
      endColumn: column + offendingSymbol.text.length
    };

    // Now attempt to detect known patterns and improve the error messages
    const oneTokenBack = getPreviousNonWsToken(recognizer, offendingSymbol);
    const twoTokensBack = getPreviousNonWsToken(recognizer, oneTokenBack);

    // ########################################################################
    // # Missing space around =                                               #
    // ########################################################################

    // Alias: MyAlias =http://myserver.com/
    // > missing '=' at '=http://myserver.com/'
    if (
      /^missing '='/.test(msg) &&
      /^=/.test(offendingSymbol.text) &&
      !/^\^/.test(oneTokenBack?.text)
    ) {
      message =
        "Alias declarations must include at least one space both before and after the '=' sign";
    }

    // Alias: MyAlias= http://myserver.com/
    // > missing '=' at 'http://myserver.com/'
    else if (/^missing '='/.test(msg) && /^[^\^].*=$/.test(oneTokenBack?.text)) {
      message =
        "Alias declarations must include at least one space both before and after the '=' sign";
      // Need to adjust the location to match the previous token (where '=' is)
      location = getTokenLocation(oneTokenBack);
    }

    // Alias: MyAlias=http://myserver.com/
    // > mismatched input '<EOF>' expecting '='
    else if (
      /^mismatched input .+ expecting '='$/.test(msg) &&
      /^[^\^].*=/.test(oneTokenBack?.text)
    ) {
      message =
        "Alias declarations must include at least one space both before and after the '=' sign";
      // Need to adjust the location to match the previous token (where '=' is)
      location = getTokenLocation(oneTokenBack);
    }

    // * active= true
    // > no viable alternative at input '* active= true'
    // * active =true
    // > no viable alternative at input '* active =true'
    // * active=true
    // > no viable alternative at input '* active=true'
    else if (/^no viable alternative at input '.*((\S=)|(=\S))/.test(msg)) {
      message =
        "Assignment rules must include at least one space both before and after the '=' sign";
    }

    // * component ^short ="Component1"
    // > 'missing '=' at '="Component1"''
    else if (
      /^missing '='/.test(msg) &&
      /^=/.test(offendingSymbol.text) &&
      /^\^/.test(oneTokenBack?.text)
    ) {
      message =
        "Assignment rules must include at least one space both before and after the '=' sign";
    }

    // * component ^short ="A component"
    // > extraneous input 'component\"' expecting {<EOF>, KW_ALIAS, KW_PROFILE, KW_EXTENSION, KW_INSTANCE, KW_INVARIANT, KW_VALUESET, KW_CODESYSTEM, KW_RULESET, KW_MAPPING}
    else if (
      /^extraneous input/.test(msg) &&
      /^\^/.test(twoTokensBack?.text) &&
      /^=/.test(oneTokenBack?.text)
    ) {
      message =
        "Assignment rules must include at least one space both before and after the '=' sign";
      // Need to adjust the location to match the previous token (where '=' is)
      location = getTokenLocation(oneTokenBack);
    }

    // * component ^short= "Component1"
    // > 'missing '=' at '"Component1"''
    // * component ^short= "A component"
    // > missing '=' at '"A component"'
    // * component ^short="A component"
    // > missing '=' at 'component"'
    else if (/^missing '='/.test(msg) && /^\^.+=/.test(oneTokenBack?.text)) {
      message =
        "Assignment rules must include at least one space both before and after the '=' sign";
      // Need to adjust the location to match the previous token (where '=' is)
      location = getTokenLocation(oneTokenBack);
    }

    // * component ^short="Component1"
    // > 'mismatched input '<EOF>' expecting '=''
    else if (/^mismatched input .+ expecting '='$/.test(msg) && /^\^.+=/.test(oneTokenBack?.text)) {
      message =
        "Assignment rules must include at least one space both before and after the '=' sign";
      // Need to adjust the location to match the previous token (where '=' is)
      location = getTokenLocation(oneTokenBack);
    }

    // ########################################################################
    // # Missing spaces around ->                                             #
    // ########################################################################

    // * identifier ->"Patient.identifier"
    // > mismatched input '->\"Patient.identifier\"' expecting '->'
    // * identifier->"Patient.identifier"
    // > mismatched input '<EOF>' expecting '->'
    else if (/^mismatched input .+ expecting '->'$/.test(msg)) {
      message =
        "Mapping rules must include at least one space both before and after the '->' operator";
      // Need to adjust the location to match the previous token (where '=' is)
      location = getTokenLocation(oneTokenBack);
    }

    // * identifier-> "Patient.identifier"
    // > missing '->' at '"Patient.identifier"'
    else if (/^missing '->'/.test(msg) && /->$/.test(oneTokenBack?.text)) {
      message =
        "Mapping rules must include at least one space both before and after the '->' operator";
      // Need to adjust the location to match the previous token (where '=' is)
      location = getTokenLocation(oneTokenBack);
    }

    // ########################################################################
    // # Missing space after *                                                #
    // ########################################################################

    // *active = true
    // > extraneous input '*component' expecting {<EOF>, KW_ALIAS, KW_PROFILE, KW_EXTENSION,
    // > KW_INSTANCE, KW_INVARIANT, KW_VALUESET, KW_CODESYSTEM, KW_RULESET, KW_MAPPING}
    else if (/^extraneous input '\*\S/.test(msg)) {
      message = "Rules must start with a '*' symbol followed by at least one space";
    }

    return { message, location };
  }
}

/**
 * Gets the previous non-whitespace token, which may be needed to help interpret the error
 * @param recognizer - the Recognizer instance provided by ANTLR
 * @param token - the token ahead of the token we want returned
 * @returns the previous non-WS token or undefined if there is no previous non-WS token
 */
function getPreviousNonWsToken(recognizer: Recognizer, token: Token): Token | undefined {
  if (token == null) {
    return;
  }

  for (let i = token.tokenIndex - 1; i >= 0; i--) {
    // @ts-ignore _input is private, but we need it
    const previousToken = recognizer._input.tokens[i];
    if (/\S/.test(previousToken.text)) {
      return previousToken;
    }
  }
}

function getTokenLocation(token: Token): TextLocation {
  return {
    startLine: token.line,
    startColumn: token.column + 1,
    endLine: token.line,
    endColumn: token.column + token.text.length
  };
}
