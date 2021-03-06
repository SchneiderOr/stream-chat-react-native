import React from 'react';
import { View } from 'react-native';
import { buildStylesheet } from '../../styles/styles.js';

import { MessageStatus } from './MessageStatus';
import { MessageContent } from './MessageContent';
import { MessageAvatar } from './MessageAvatar';

export class MessageSimple extends React.PureComponent {
  render() {
    const { message, isMyMessage, style, editing } = this.props;
    const styles = buildStylesheet('MessageSimple', style);
    const pos = isMyMessage(message) ? 'right' : 'left';
    const bottomMargin =
      message.groupPosition[0] === 'single' ||
      message.groupPosition[0] === 'bottom'
        ? 'bottom'
        : null;
    return (
      <View
        style={{
          ...styles.container,
          ...styles[pos],
          ...styles[bottomMargin],
          backgroundColor: editing.id === message.id ? 'pink' : 'white',
        }}
      >
        {isMyMessage(message) ? (
          <React.Fragment>
            <MessageContent {...this.props} />
            <MessageAvatar {...this.props} />
            <MessageStatus {...this.props} />
          </React.Fragment>
        ) : (
          <React.Fragment>
            <MessageAvatar {...this.props} />
            <MessageContent {...this.props} />
          </React.Fragment>
        )}
      </View>
    );
  }
}
