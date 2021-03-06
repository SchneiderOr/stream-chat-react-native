import React from 'react';
import { TextInput } from 'react-native';
import { buildStylesheet } from '../styles/styles';
import PropTypes from 'prop-types';

export class AutoCompleteInput extends React.PureComponent {
  static propTypes = {
    value: PropTypes.string,
    openSuggestions: PropTypes.func,
    closeSuggestions: PropTypes.func,
    triggerSettings: PropTypes.object,
    getUsers: PropTypes.func,
    setInputBoxRef: PropTypes.func,
  };

  static defaultProps = {
    value: '',
  };

  constructor(props) {
    super(props);

    this.state = {
      text: props.value,
      selectionStart: 0,
      selectionEnd: 0,
      currentTrigger: null,
    };

    this.isTrackingStarted = false;
    this.previousChar = ' ';

    this._createRegExp();
  }

  componentDidUpdate(prevProps) {
    // console.log('in component did update: ' + prevProps.value);
    if (prevProps.value !== this.props.value) {
      this.setState({ text: this.props.value });
      this.handleChange(this.props.value, true);
    }
  }

  startTracking = () => {
    this.isTrackingStarted = true;
    this.props.openSuggestions();
    // console.log('start TRACKING');
  };

  stopTracking = () => {
    this.isTrackingStarted = false;
    // console.log('STOP TRACKING');
    this.props.closeSuggestions();
  };

  updateSuggestions(q) {
    const triggers = this.props.triggerSettings;
    const currentTrigger = '@';
    // console.log('from update suggestions: ' + currentTrigger);
    this.props.updateSuggestions({
      data: triggers[currentTrigger].dataProvider(q, this.props.getUsers()),
      onSelect: this.onSelectSuggestion,
      output: triggers[currentTrigger].output,
    });
  }

  handleChange = (text, fromUpdate = false) => {
    // console.log('in handle change: ' + text + ' from update: ' + fromUpdate);
    if (!fromUpdate) {
      this.props.onChange(text);
      return;
    }

    this.handleSuggestions(text);
  };

  handleSelectionChange = ({
    nativeEvent: {
      selection: { start, end },
    },
  }) => {
    // console.log('in handle selection: ', start, end);
    this.setState({ selectionStart: start, selectionEnd: end });
  };

  onSelectSuggestion = (item) => {
    const { text, currentTrigger } = this.state;
    const { selectionEnd } = this.state;
    const triggers = this.props.triggerSettings;
    const newToken = triggers[currentTrigger].output(item);
    // const { onChange, trigger } = this.props;

    if (!currentTrigger) return;

    const computeCaretPosition = (token, startToken) =>
      startToken + token.length;

    const textToModify = text.slice(0, selectionEnd);

    const startOfTokenPosition = textToModify.search(
      /**
       * It's important to escape the currentTrigger char for chars like [, (,...
       */
      new RegExp(
        `\\${currentTrigger}${`[^\\${currentTrigger}${
          triggers[currentTrigger].allowWhitespace ? '' : '\\s'
        }]`}*$`,
      ),
    );

    // we add space after emoji is selected if a caret position is next
    const newTokenString = `${newToken.text} `;

    const newCaretPosition = computeCaretPosition(
      newTokenString,
      startOfTokenPosition,
    );
    const modifiedText =
      textToModify.substring(0, startOfTokenPosition) + newTokenString;

    this.stopTracking();
    this.props.onChange(text.replace(textToModify, modifiedText));

    this.syncCaretPosition(newCaretPosition);

    triggers[currentTrigger].callback(item);
  };

  syncCaretPosition = async (position = 0) => {
    await this.setState({ selectionStart: position, selectionEnd: position });
  };

  _createRegExp = () => {
    const triggers = this.props.triggerSettings;

    // negative lookahead to match only the trigger + the actual token = "bladhwd:adawd:word test" => ":word"
    // https://stackoverflow.com/a/8057827/2719917
    this.tokenRegExp = new RegExp(
      `([${Object.keys(triggers).join('')}])(?:(?!\\1)[^\\s])*$`,
    );
  };

  handleSuggestions = async (text) => {
    // console.log('in handle suggestions: ' + text);
    const { selectionEnd: selectionEnd } = this.state;

    // TODO: Move these const to props
    const minChar = 0;

    let tokenMatch = this.tokenRegExp.exec(text.slice(0, selectionEnd));
    let lastToken = tokenMatch && tokenMatch[0];
    const triggers = this.props.triggerSettings;

    let currentTrigger =
      (lastToken && Object.keys(triggers).find((a) => a === lastToken[0])) ||
      null;

    /*
      if we lost the trigger token or there is no following character we want to close
      the autocomplete
    */
    if (
      (!lastToken || lastToken.length <= minChar) &&
      // check if our current trigger disallows whitespace
      ((this.state.currentTrigger &&
        !triggers[this.state.currentTrigger].allowWhitespace) ||
        !this.state.currentTrigger)
    ) {
      // console.log('here 1');
      this.stopTracking();
      return;
    }

    /**
     * This code has to be sync that is the reason why we obtain the currentTrigger
     * from currentTrigger not this.state.currentTrigger
     *
     * Check if the currently typed token has to be afterWhitespace, or not.
     */
    if (
      currentTrigger &&
      text[tokenMatch.index - 1] &&
      (triggers[currentTrigger].afterWhitespace &&
        !text[tokenMatch.index - 1].match(/\s/))
    ) {
      // console.log('here 2');
      this.stopTracking();
      return;
    }

    /**
    If our current trigger allows whitespace
    get the correct token for DataProvider, so we need to construct new RegExp
   */
    if (
      this.state.currentTrigger &&
      triggers[this.state.currentTrigger].allowWhitespace
    ) {
      tokenMatch = new RegExp(
        `\\${this.state.currentTrigger}[^${this.state.currentTrigger}]*$`,
      ).exec(text.slice(0, selectionEnd));
      lastToken = tokenMatch && tokenMatch[0];

      if (!lastToken) {
        // console.log('here 3');
        this.stopTracking();
        return;
      }

      currentTrigger =
        Object.keys(triggers).find((a) => a === lastToken[0]) || null;
    }

    const actualToken = lastToken.slice(1);

    // if trigger is not configured step out from the function, otherwise proceed
    if (!currentTrigger) {
      return;
    }

    await this.setState({ currentTrigger });

    if (!this.isTrackingStarted) this.startTracking();
    // console.log('from handle suggestions: ' + currentTrigger);
    this.updateSuggestions(actualToken);
  };

  render() {
    const styles = buildStylesheet('MessageInput', this.props.style);
    // console.log('RENDERING THE COMPONENT: ' + this.state.text);
    return (
      <TextInput
        ref={this.props.setInputBoxRef}
        style={styles.inputBox}
        placeholder="Write your message"
        onChangeText={(text) => {
          this.handleChange(text);
        }}
        numberOfLines={20}
        value={this.state.text}
        onSelectionChange={this.handleSelectionChange}
        multiline
      />
    );
  }
}
