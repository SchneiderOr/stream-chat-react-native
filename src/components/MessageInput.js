import React, { PureComponent } from 'react';
import { View, Text, Image, TouchableOpacity } from 'react-native';
import { withChannelContext, withSuggestionsContext } from '../context';
import { logChatPromiseExecution } from 'stream-chat';
import { buildStylesheet } from '../styles/styles';
import iconEdit from '../images/icons/icon_edit.png';
import iconNewMessage from '../images/icons/icon_new_message.png';
import { ImageUploadPreview } from './ImageUploadPreview';
import { FileUploadPreview } from './FileUploadPreview';
import { pickImage, pickDocument } from '../native';
import { lookup } from 'mime-types';
import Immutable from 'seamless-immutable';
import { FileState, ACITriggerSettings } from '../utils';
import PropTypes from 'prop-types';
import uniq from 'lodash/uniq';

import ActionSheet from '../vendor/react-native-actionsheet/lib';
// import iconMedia from '../images/icons/icon_attach-media.png';
import iconGallery from '../images/icons/gallery.png';
import { AutoCompleteInput } from './AutoCompleteInput';

// https://stackoverflow.com/a/6860916/2570866
function generateRandomId() {
  // prettier-ignore
  return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
}

function S4() {
  return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
}

const MessageInput = withSuggestionsContext(
  withChannelContext(
    class MessageInput extends PureComponent {
      constructor(props) {
        super(props);
        const state = this.getMessageDetailsForState(props.editing);
        this.state = { ...state };
      }

      static propTypes = {
        /** Override image upload request */
        doImageUploadRequest: PropTypes.func,
        /** Override file upload request */
        doFileUploadRequest: PropTypes.func,
        maxNumberOfFiles: PropTypes.number,
        hasImagePicker: PropTypes.bool,
        hasFilePicker: PropTypes.bool,
      };

      static defaultProps = {
        hasImagePicker: true,
        hasFilePicker: true,
      };

      getMessageDetailsForState = (message) => {
        const imageOrder = [];
        const imageUploads = {};
        const fileOrder = [];
        const fileUploads = {};
        const attachments = [];
        let mentioned_users = [];
        let text = '';

        if (message) {
          text = message.text;
          for (const attach of message.attachments) {
            if (attach.type === 'image') {
              const id = generateRandomId();
              imageOrder.push(id);
              imageUploads[id] = {
                id,
                url: attach.image_url,
                state: 'finished',
                file: { name: attach.fallback },
              };
            } else if (attach.type === 'file') {
              const id = generateRandomId();
              fileOrder.push(id);
              fileUploads[id] = {
                id,
                url: attach.asset_url,
                state: 'finished',
                file: {
                  name: attach.title,
                  type: attach.mime_type,
                  size: attach.file_size,
                },
              };
            } else {
              attachments.push(attach);
            }
          }

          if (message.mentioned_users) {
            mentioned_users = [...message.mentioned_users];
            console.log(mentioned_users);
          }
        }
        return {
          text,
          attachments,
          imageOrder,
          imageUploads: Immutable(imageUploads),
          fileOrder,
          fileUploads: Immutable(fileUploads),
          mentioned_users,
          numberOfUploads: 0,
        };
      };

      getUsers = () => {
        const users = [];
        const members = this.props.members;
        const watchers = this.props.watchers;
        if (members && Object.values(members).length) {
          Object.values(members).forEach((member) => users.push(member.user));
        }

        if (watchers && Object.values(watchers).length) {
          users.push(...Object.values(watchers));
        }

        // make sure we don't list users twice
        const userMap = {};
        for (const user of users) {
          if (user !== undefined && !userMap[user.id]) {
            userMap[user.id] = user;
          }
        }
        const usersArray = Object.values(userMap);
        return usersArray;
      };

      componentDidMount() {
        if (this.props.editing) this.inputBox.focus();
      }

      componentDidUpdate(prevProps) {
        if (this.props.editing) this.inputBox.focus();
        if (
          this.props.editing &&
          prevProps.editing &&
          this.props.editing.id === prevProps.editing.id
        ) {
          return;
        }

        if (this.props.editing && !prevProps.editing) {
          this.setState(this.getMessageDetailsForState(this.props.editing));
        }

        if (
          this.props.editing &&
          prevProps.editing &&
          this.props.editing.id !== prevProps.editing.id
        ) {
          this.setState(this.getMessageDetailsForState(this.props.editing));
        }

        if (!this.props.editing && prevProps.editing) {
          this.setState(this.getMessageDetailsForState());
        }
      }

      onSelectItem = (item) => {
        this.setState((prevState) => ({
          mentioned_users: [...prevState.mentioned_users, item.id],
        }));
      };

      sendMessage = () => {
        const attachments = [];
        for (const id of this.state.imageOrder) {
          const image = this.state.imageUploads[id];
          if (!image || image.state === FileState.UPLOAD_FAILED) {
            continue;
          }
          if (image.state === FileState.UPLOADING) {
            // TODO: show error to user that they should wait until image is uploaded
            return;
          }
          attachments.push({
            type: 'image',
            image_url: image.url,
            fallback: image.file.name,
          });
        }

        for (const id of this.state.fileOrder) {
          const upload = this.state.fileUploads[id];
          if (!upload || upload.state === FileState.UPLOAD_FAILED) {
            continue;
          }
          if (upload.state === FileState.UPLOADING) {
            // TODO: show error to user that they should wait until image is uploaded
            return;
          }
          attachments.push({
            type: 'file',
            asset_url: upload.url,
            title: upload.file.name,
            mime_type: upload.file.type,
            file_size: upload.file.size,
          });
        }

        if (this.props.editing) {
          const { id } = this.props.editing;
          const updatedMessage = { id };
          updatedMessage.text = this.state.text;
          updatedMessage.attachments = attachments;
          updatedMessage.mentioned_users = this.state.mentioned_users.map(
            (mu) => mu.id,
          );
          // TODO: Remove this line and show an error when submit fails
          this.props.clearEditingState();

          const updateMessagePromise = this.props.client
            .updateMessage(updatedMessage)
            .then(() => {
              this.props.clearEditingState();
            });
          logChatPromiseExecution(updateMessagePromise, 'update message');
        } else {
          try {
            this.props.sendMessage({
              text: this.state.text,
              parent: this.props.parent,
              mentioned_users: uniq(this.state.mentioned_users),
              attachments,
            });
            this.setState({
              text: '',
              imageUploads: Immutable({}),
              imageOrder: Immutable([]),
              fileUploads: Immutable({}),
              fileOrder: Immutable([]),
              mentioned_users: [],
            });
          } catch (err) {
            console.log('Fialed');
          }
        }
      };

      updateMessage = async () => {
        try {
          await this.props.client.updateMessage({
            ...this.props.editing,
            text: this.state.text,
          });

          this.setState({ text: '' });
          this.props.clearEditingState();
        } catch (err) {
          console.log(err);
        }
      };

      // https://stackoverflow.com/a/29234240/7625485
      constructTypingString = (dict) => {
        const arr2 = Object.keys(dict);
        const arr3 = [];
        arr2.forEach((item, i) => {
          if (this.props.client.user.id === dict[arr2[i]].user.id) {
            return;
          }
          arr3.push(dict[arr2[i]].user.name || dict[arr2[i]].user.id);
        });
        let outStr = '';
        if (arr3.length === 1) {
          outStr = arr3[0] + ' is typing...';
          dict;
        } else if (arr3.length === 2) {
          //joins all with "and" but =no commas
          //example: "bob and sam"
          outStr = arr3.join(' and ') + ' are typing...';
        } else if (arr3.length > 2) {
          //joins all with commas, but last one gets ", and" (oxford comma!)
          //example: "bob, joe, and sam"
          outStr =
            arr3.slice(0, -1).join(', ') +
            ', and ' +
            arr3.slice(-1) +
            ' are typing...';
        }

        return outStr;
      };

      _pickFile = async () => {
        if (
          this.props.maxNumberOfFiles &&
          this.state.numberOfUploads >= this.props.maxNumberOfFiles
        )
          return;

        const result = await pickDocument();
        if (result.type === 'cancel') {
          return;
        }
        const mimeType = lookup(result.name);

        if (mimeType.startsWith('image/')) {
          this.uploadNewImage(result);
        } else {
          this.uploadNewFile(result);
        }
      };

      uploadNewFile = (file) => {
        const id = generateRandomId();
        const mimeType = lookup(file.name);
        /* eslint-disable */
        this.setState((prevState) => {
          return {
            numberOfUploads: prevState.numberOfUploads + 1,
            fileOrder: prevState.fileOrder.concat([id]),
            fileUploads: prevState.fileUploads.setIn([id], {
              id,
              file: { ...file, type: mimeType },
              state: FileState.UPLOADING,
            }),
          };
        });
        /* eslint-enable */

        this._uploadFile(id);
      };

      _uploadFile = async (id) => {
        const doc = this.state.fileUploads[id];
        if (!doc) {
          return;
        }
        const { file } = doc;

        await this.setState((prevState) => ({
          fileUploads: prevState.fileUploads.setIn(
            [id, 'state'],
            FileState.UPLOADING,
          ),
        }));

        let response = {};
        response = {};
        try {
          if (this.props.doDocUploadRequest) {
            response = await this.props.doDocUploadRequest(
              file,
              this.props.channel,
            );
          } else {
            response = await this.props.channel.sendFile(file.uri);
          }
        } catch (e) {
          console.warn(e);
          await this.setState((prevState) => {
            const image = prevState.fileUploads[id];
            if (!image) {
              return {
                numberOfUploads: prevState.numberOfUploads - 1,
              };
            }
            return {
              fileUploads: prevState.fileUploads.setIn(
                [id, 'state'],
                FileState.UPLOAD_FAILED,
              ),
              numberOfUploads: prevState.numberOfUploads - 1,
            };
          });

          return;
        }

        this.setState((prevState) => ({
          fileUploads: prevState.fileUploads
            .setIn([id, 'state'], FileState.UPLOADED)
            .setIn([id, 'url'], response.file),
        }));
      };

      _pickImage = async () => {
        if (
          this.props.maxNumberOfFiles &&
          this.state.numberOfUploads >= this.props.maxNumberOfFiles
        )
          return;

        const result = await pickImage();
        if (result.cancelled) {
          return;
        }

        this.uploadNewImage(result);
      };

      uploadNewImage = (image) => {
        const id = generateRandomId();
        /* eslint-disable */
        this.setState((prevState) => {
          return {
            numberOfUploads: prevState.numberOfUploads + 1,
            imageOrder: prevState.imageOrder.concat([id]),
            imageUploads: prevState.imageUploads.setIn([id], {
              id,
              file: image,
              state: FileState.UPLOADING,
            }),
          };
        });
        /* eslint-enable */

        this._uploadImage(id);
      };

      _removeImage = (id) => {
        this.setState((prevState) => {
          const img = prevState.imageUploads[id];
          if (!img) {
            return {};
          }
          return {
            numberOfUploads: prevState.numberOfUploads - 1,
            imageUploads: prevState.imageUploads.set(id, undefined), // remove
            imageOrder: prevState.imageOrder.filter((_id) => id !== _id),
          };
        });
      };

      _removeFile = (id) => {
        this.setState((prevState) => {
          const file = prevState.fileUploads[id];
          if (!file) {
            return {};
          }
          return {
            numberOfUploads: prevState.numberOfUploads - 1,
            fileUploads: prevState.fileUploads.set(id, undefined), // remove
            fileOrder: prevState.fileOrder.filter((_id) => id !== _id),
          };
        });
      };

      _uploadImage = async (id) => {
        const img = this.state.imageUploads[id];
        if (!img) {
          return;
        }
        const { file } = img;

        await this.setState((prevState) => ({
          imageUploads: prevState.imageUploads.setIn(
            [id, 'state'],
            FileState.UPLOADING,
          ),
        }));

        let response = {};
        response = {};

        const filename = (file.name || file.uri).replace(
          /^(file:\/\/|content:\/\/)/,
          '',
        );
        const contentType = lookup(filename) || 'application/octet-stream';

        try {
          if (this.props.doImageUploadRequest) {
            response = await this.props.doImageUploadRequest(
              file,
              this.props.channel,
            );
          } else {
            response = await this.props.channel.sendImage(
              file.uri,
              null,
              contentType,
            );
          }
        } catch (e) {
          console.warn(e);
          await this.setState((prevState) => {
            const image = prevState.imageUploads[id];
            if (!image) {
              return {
                numberOfUploads: prevState.numberOfUploads - 1,
              };
            }

            return {
              imageUploads: prevState.imageUploads.setIn(
                [id, 'state'],
                FileState.UPLOAD_FAILED,
              ),
              numberOfUploads: prevState.numberOfUploads - 1,
            };
          });

          return;
        }
        this.setState((prevState) => ({
          imageUploads: prevState.imageUploads
            .setIn([id, 'state'], FileState.UPLOADED)
            .setIn([id, 'url'], response.file),
        }));
      };

      onChange = (text) => {
        this.setState({ text });

        if (text) {
          logChatPromiseExecution(
            this.props.channel.keystroke(),
            'start typing event',
          );
        }
      };

      setInputBoxRef = (o) => (this.inputBox = o);

      render() {
        const styles = buildStylesheet('MessageInput', this.props.style);
        const { hasImagePicker, hasFilePicker } = this.props;

        return (
          <React.Fragment>
            <View
              style={{
                ...styles.container,
                paddingTop: this.state.imageUploads.length > 0 ? 20 : 0,
              }}
            >
              {this.state.fileUploads && (
                <FileUploadPreview
                  removeFile={this._removeFile}
                  retryUpload={this._uploadFile}
                  fileUploads={this.state.fileOrder.map(
                    (id) => this.state.fileUploads[id],
                  )}
                />
              )}
              {this.state.imageUploads && (
                <ImageUploadPreview
                  removeImage={this._removeImage}
                  retryUpload={this._uploadImage}
                  imageUploads={this.state.imageOrder.map(
                    (id) => this.state.imageUploads[id],
                  )}
                />
              )}
              <View
                style={styles.inputBoxContainer}
                ref={this.props.setInputBoxContainerRef}
              >
                <TouchableOpacity
                  style={styles.attachButton}
                  onPress={() => {
                    if (hasImagePicker && hasFilePicker)
                      this.attachActionSheet.show();
                    else if (hasImagePicker && !hasFilePicker)
                      this._pickImage();
                    else if (!hasImagePicker && hasFilePicker) this._pickFile();
                  }}
                >
                  <Image source={iconGallery} style={styles.attachButtonIcon} />
                </TouchableOpacity>
                {/**
                  TODO: Use custom action sheet to show icon with titles of button. But it doesn't
                  work well with async onPress operations. So find a solution.
                */}
                <ActionSheet
                  ref={(o) => (this.attachActionSheet = o)}
                  title={'Add a file'}
                  options={['Select a photo', 'Upload a file']}
                  cancelButtonIndex={2}
                  destructiveButtonIndex={2}
                  onPress={(index) => {
                    switch (index) {
                      case 0:
                        this._pickImage();
                        break;
                      case 1:
                        this._pickFile();
                        break;
                      default:
                    }
                  }}
                />
                <AutoCompleteInput
                  openSuggestions={this.props.openSuggestions}
                  closeSuggestions={this.props.closeSuggestions}
                  updateSuggestions={this.props.updateSuggestions}
                  value={this.state.text}
                  onChange={this.onChange}
                  getUsers={this.getUsers}
                  setInputBoxRef={this.setInputBoxRef}
                  triggerSettings={ACITriggerSettings(this.onSelectItem)}
                />
                <TouchableOpacity
                  style={styles.sendButton}
                  title="Pick an image from camera roll"
                  onPress={this.sendMessage}
                >
                  {this.props.editing ? (
                    <Image source={iconEdit} />
                  ) : (
                    <Image source={iconNewMessage} />
                  )}
                </TouchableOpacity>
              </View>
            </View>
            <Text style={{ textAlign: 'right', height: 20 }}>
              {this.props.channel.state.typing
                ? this.constructTypingString(this.props.channel.state.typing)
                : ''}
            </Text>
          </React.Fragment>
        );
      }
    },
  ),
);

export { MessageInput };
