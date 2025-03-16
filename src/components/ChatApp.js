import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import PubNub from 'pubnub';
import { PubNubProvider, usePubNub } from 'pubnub-react';
import './ChatApp.css';

const PUBNUB_CONFIG = {
  PUBLISH_KEY: 'pub-c-23f037a2-848c-456a-9410-164ca67d6b19',
  SUBSCRIBE_KEY: 'sub-c-d5bea3bd-37e0-4767-8cac-37b4cdb860a6'
};

// Main Chat component that handles messaging
const Chat = () => {
  const pubnub = usePubNub();
  const location = useLocation();
  const query = new URLSearchParams(location.search);

  const activeUserId = query.get('user') || 'default-user';
  const peerUserId = query.get('peer') || 'peer-user';

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const channelName = [activeUserId, peerUserId].sort().join('-');
  const [channel] = useState(channelName);
  const messagesEndRef = useRef(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [oldestMessageTimetoken, setOldestMessageTimetoken] = useState(null);
  const messagesPerPage = 100;
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);
  const allowedFileTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'text/plain'];
  const maxFileSize = 5 * 1024 * 1024; // 5MB

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Effect for subscription and message listener
  useEffect(() => {
    // Subscribe to the channel
    console.log('Subscribing to channel:', channel);

    // Add message listener
    const listener = {
      message: messageEvent => {
        console.log('Received message:', messageEvent.message);
        const message = messageEvent.message;
        setMessages(prevMessages => [...prevMessages, message]);
      },
      status: statusEvent => {
        if (statusEvent.category === 'PNConnectedCategory') {
          console.log('Connected to PubNub');
          setIsSubscribed(true);
        }
      }
    };

    pubnub.addListener(listener);
    pubnub.subscribe({ channels: [channel] });

    // Cleanup on unmount
    return () => {
      console.log('Unsubscribing from channel:', channel);
      pubnub.removeListener(listener);
      pubnub.unsubscribe({ channels: [channel] });
      setIsSubscribed(false);
    };
  }, [pubnub, channel, activeUserId, peerUserId]);

  // Function to compress image before uploading
  const compressImage = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);

      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;

        img.onload = () => {
          // Create canvas for compression
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Calculate new dimensions while maintaining aspect ratio
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 600;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;

          // Draw image on canvas with new dimensions
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // Get compressed image as data URL
          const compressedDataUrl = canvas.toDataURL(file.type, 0.7); // 0.7 quality (70%)

          resolve(compressedDataUrl);
        };

        img.onerror = () => {
          reject(new Error('Failed to load image for compression'));
        };
      };

      reader.onerror = () => {
        reject(new Error('Failed to read file for compression'));
      };
    });
  };

  // Function to upload file
  const uploadFile = (file) => {
    setIsUploading(true);

    // For images, compress first
    if (file.type.startsWith('image/')) {
      compressImage(file)
        .then(compressedDataUrl => {
          console.log('Image compressed successfully');
          const fileName = file.name;
          const fileType = file.type;
          const base64Data = compressedDataUrl.split(',')[1];

          sendFileMessage(fileName, fileType, base64Data);
          setIsUploading(false);
        })
        .catch(error => {
          console.error('Error compressing image:', error);
          // Fall back to regular upload
          readAndUploadFile(file);
        });
    } else {
      // For non-image files, use regular upload
      readAndUploadFile(file);
    }
  };

  // Function to read and upload non-image files
  const readAndUploadFile = (file) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const fileData = event.target.result;
      const fileType = file.type;
      const fileName = file.name;

      // For text files, send the content directly
      if (fileType === 'text/plain') {
        const textContent = event.target.result;
        // Check if text content is too large
        if (textContent.length > 10000) {
          // If text is too large, truncate it
          const truncatedContent = textContent.substring(0, 10000) + '... (content truncated due to size)';
          sendFileMessage(fileName, fileType, truncatedContent);
        } else {
          sendFileMessage(fileName, fileType, textContent);
        }
        setIsUploading(false);
        return;
      }

      // For PDFs, convert to base64
      try {
        // Check if we have a data URL format
        let base64Data;
        if (typeof fileData === 'string' && fileData.includes('base64,')) {
          base64Data = fileData.split(',')[1]; // Remove the data URL prefix
        } else {
          // Handle binary data
          base64Data = btoa(
            new Uint8Array(fileData)
              .reduce((data, byte) => data + String.fromCharCode(byte), '')
          );
        }

        // Check if the base64 data is too large (PubNub has a message size limit)
        if (base64Data.length > 32000) {
          alert('File is too large to send directly. Please use a file sharing service and share the link instead.');
          setIsUploading(false);
          return;
        }

        sendFileMessage(fileName, fileType, base64Data);
      } catch (error) {
        console.error('Error processing file:', error);
        alert('Error processing file. Please try a smaller file or a different format.');
      } finally {
        setIsUploading(false);
      }
    };

    reader.onerror = (error) => {
      console.error('Error reading file:', error);
      setIsUploading(false);
      alert('Error uploading file. Please try again with a smaller file.');
    };

    // Read file as appropriate format
    try {
      if (file.type === 'text/plain') {
        reader.readAsText(file);
      } else {
        reader.readAsDataURL(file);
      }
    } catch (error) {
      console.error('Error starting file read:', error);
      setIsUploading(false);
      alert('Error preparing file for upload. Please try again.');
    }
  };

  // Function to handle file selection
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Check file type
    if (!allowedFileTypes.includes(file.type)) {
      alert('Only images, PDFs, and text files are allowed.');
      return;
    }

    // Check file size - more strict limits based on file type
    const fileSizeMB = file.size / (1024 * 1024);
    console.log(`File size: ${fileSizeMB.toFixed(2)} MB`);

    // Different size limits based on file type
    let sizeLimit = 5; // Default 5MB

    if (file.type.startsWith('image/')) {
      sizeLimit = 2; // 2MB for images
    } else if (file.type === 'application/pdf') {
      sizeLimit = 3; // 3MB for PDFs
    } else if (file.type === 'text/plain') {
      sizeLimit = 1; // 1MB for text files
    }

    if (fileSizeMB > sizeLimit) {
      alert(`File is too large. ${file.type.split('/')[1].toUpperCase()} files must be less than ${sizeLimit}MB.`);
      return;
    }

    uploadFile(file);
  };

  // Function to send file message
  const sendFileMessage = (fileName, fileType, fileData) => {
    // Create a message object
    const message = {
      type: 'file',
      fileName: fileName,
      fileType: fileType,
      fileData: fileData,
      sender: activeUserId,
      timestamp: new Date().toISOString()
    };

    console.log(`Publishing file message to channel: ${channel}, file: ${fileName}, type: ${fileType}`);

    // Add retry logic for publishing
    const publishWithRetry = (retryCount = 0) => {
      pubnub.publish({
        channel: channel,
        message,
        storeInHistory: true
      }, (status, response) => {
        if (status.error) {
          console.error('Error publishing file message:', status);

          // Retry logic
          if (retryCount < 3) {
            console.log(`Retrying publish (${retryCount + 1}/3)...`);
            setTimeout(() => {
              publishWithRetry(retryCount + 1);
            }, 1000 * (retryCount + 1)); // Exponential backoff
          } else {
            alert('Failed to send file after multiple attempts. Please try again later or with a smaller file.');
          }
        } else {
          console.log('File message published successfully:', response);
        }
      });
    };

    // Start publish with retry
    publishWithRetry();
  };

  // Function to trigger file input click
  const triggerFileUpload = () => {
    fileInputRef.current.click();
  };

  // Function to render file content based on type
  const renderFileContent = (message) => {
    const { fileType, fileData, fileName } = message;

    if (fileType.startsWith('image/')) {
      return (
        <img
          src={`data:${fileType};base64,${fileData}`}
          alt={fileName}
          className="file-image"
        />
      );
    } else if (fileType === 'application/pdf') {
      return (
        <div className="file-attachment">
          <div className="file-icon">PDF</div>
          <div className="file-info">
            <span className="file-name">{fileName}</span>
            <a
              href={`data:${fileType};base64,${fileData}`}
              download={fileName}
              className="file-download"
            >
              Download
            </a>
          </div>
        </div>
      );
    } else if (fileType === 'text/plain') {
      return (
        <div className="text-file-content">
          <div className="text-file-header">{fileName}</div>
          <pre className="text-file-data">{fileData}</pre>
        </div>
      );
    }

    return (
      <div className="file-attachment">
        <div className="file-icon">FILE</div>
        <div className="file-info">
          <span className="file-name">{fileName}</span>
          <a
            href={`data:${fileType};base64,${fileData}`}
            download={fileName}
            className="file-download"
          >
            Download
          </a>
        </div>
      </div>
    );
  };

  // Function to fetch message history with pagination
  const fetchMessageHistory = (start = null) => {
    const isInitialFetch = start === null;

    if (isInitialFetch) {
      setIsLoading(true);
    } else {
      setLoadingMore(true);
    }

    console.log(`Fetching message history for channel: ${channel}${start ? `, starting from: ${start}` : ''}`);

    // Create fetch options
    const fetchOptions = {
      channels: [channel],
      count: messagesPerPage,
      includeTimetoken: true,
    };

    // Add start parameter for pagination if provided
    if (start) {
      fetchOptions.start = start;
    }

    console.log('Fetch options:', fetchOptions);

    // Set a timeout to handle cases where the fetch might hang
    const timeoutId = setTimeout(() => {
      console.log('Fetch timeout reached, setting loading to false');
      if (isInitialFetch) {
        setIsLoading(false);
      } else {
        setLoadingMore(false);
      }
    }, 5000); // 5 second timeout

    pubnub.fetchMessages(
      fetchOptions,
      (status, response) => {
        // Clear the timeout since we got a response
        clearTimeout(timeoutId);

        if (status.statusCode === 200) {
          if (response && response.channels && response.channels[channel]) {
            const fetchedMessages = response.channels[channel];
            console.log('Fetched messages:', fetchedMessages.length);

            // Get the oldest message timetoken for pagination
            if (fetchedMessages.length > 0) {
              // Sort by timetoken (oldest first)
              const sortedMessages = [...fetchedMessages].sort((a, b) => parseInt(a.timetoken) - parseInt(b.timetoken));
              const oldestTimetoken = sortedMessages[0].timetoken;
              console.log('Oldest message timetoken:', oldestTimetoken);
              setOldestMessageTimetoken(oldestTimetoken);

              // If we got fewer messages than requested, there are no more messages
              if (fetchedMessages.length < messagesPerPage) {
                setHasMoreMessages(false);
              }
            } else {
              setHasMoreMessages(false);
            }

            // Extract message objects from the response
            const messageObjects = fetchedMessages.map(item => {
              const message = item.message;

              // Ensure backward compatibility with existing messages
              if (message && !message.type) {
                if (message.text) {
                  return { ...message, type: 'text' };
                } else if (message.fileData) {
                  return { ...message, type: 'file' };
                }
              }

              return message;
            });

            // Update messages state
            if (isInitialFetch) {
              setMessages(messageObjects);
            } else {
              // Prepend older messages to the existing ones
              setMessages(prevMessages => [...messageObjects, ...prevMessages]);
            }
          } else {
            console.log('No message history found for channel:', channel);
            if (isInitialFetch) {
              setMessages([]);
            }
            setHasMoreMessages(false);
          }
        } else {
          console.error('Error fetching messages:', status);
          // Handle specific error cases
          if (status.statusCode === 403) {
            console.error('Permission denied. Check your PubNub keys and access permissions.');
          }
          if (isInitialFetch) {
            setMessages([]);
          }
          setHasMoreMessages(false);
        }

        if (isInitialFetch) {
          setIsLoading(false);
        } else {
          setLoadingMore(false);
        }
      }
    );
  };

  // Effect for initial message history fetch
  useEffect(() => {
    if (isSubscribed) {
      fetchMessageHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSubscribed, channel]);

  // Load more messages function
  const loadMoreMessages = () => {
    if (hasMoreMessages && !loadingMore && oldestMessageTimetoken) {
      // Set a flag in sessionStorage to indicate we're loading via button click
      sessionStorage.setItem('loadingViaButton', 'true');
      fetchMessageHistory(oldestMessageTimetoken);
    }
  };

  // Scroll to bottom when new messages arrive (but not when loading older messages)
  useEffect(() => {
    // Check if we're loading via button click
    const loadingViaButton = sessionStorage.getItem('loadingViaButton') === 'true';
    
    // Only scroll to bottom if not loading more messages and not loading via button
    if (!loadingMore && !loadingViaButton) {
      scrollToBottom();
    }
    
    // Clear the flag after the effect runs
    if (!loadingMore && loadingViaButton) {
      sessionStorage.removeItem('loadingViaButton');
    }
  }, [messages, loadingMore]);

  // Send message function
  const sendMessage = (e) => {
    e.preventDefault();
    if (input.trim() === '') return;

    const message = {
      type: 'text',
      text: input,
      sender: activeUserId,
      timestamp: new Date().toISOString()
    };

    console.log('Publishing message to channel:', channel, message);

    pubnub.publish({
      channel: channel,
      message,
      storeInHistory: true // Ensure message is stored in history
    }, (status, response) => {
      if (status.error) {
        console.error('Error publishing message:', status);
      } else {
        console.log('Message published successfully:', response);
      }
    });

    setInput('');
  };

  // Render message content based on type
  const renderMessageContent = (message) => {
    // Handle messages without a type (backward compatibility)
    if (!message.type) {
      // If it has text property, treat as text message
      if (message.text) {
        return <p>{message.text}</p>;
      }
      // If it has fileData property, treat as file message
      else if (message.fileData) {
        return renderFileContent(message);
      }
      // Fallback for unknown message format
      return <p>Unsupported message format</p>;
    }

    // Handle typed messages
    if (message.type === 'file') {
      return renderFileContent(message);
    } else {
      // Default text message
      return <p>{message.text}</p>;
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h2>Chat with {peerUserId}</h2>
        <div className="user-info">Logged in as: {activeUserId}</div>
      </div>

      <div className="messages-container">
        {hasMoreMessages && !isLoading && (
          <div className="load-more-container">
            <button
              className="load-more-button"
              onClick={loadMoreMessages}
              disabled={loadingMore}
            >
              {loadingMore ? 'Loading...' : 'Load More Messages'}
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="loading-messages">Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className="no-messages">No messages yet. Start the conversation!</div>
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              className={`message ${message.sender === activeUserId ? 'sent' : 'received'}`}
            >
              <div className="message-content">
                {renderMessageContent(message)}
                <span className="timestamp">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </span>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="message-form" onSubmit={sendMessage}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={isUploading}
        />
        <div className="file-upload-container">
          <button
            type="button"
            className="upload-button"
            onClick={triggerFileUpload}
            disabled={isUploading}
            title="Upload image, PDF, or text file (max 5MB)"
          >
            {isUploading ? 'Uploading...' : 'Upload'}
          </button>
          <div className="file-upload-info">
            <small>Images, PDFs, TXT (max 5MB)</small>
          </div>
        </div>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          style={{ display: 'none' }}
          accept=".jpg,.jpeg,.png,.gif,.pdf,.txt"
        />
        <button type="submit" disabled={isUploading || input.trim() === ''}>Send</button>
      </form>
    </div>
  );
};

// Main component that initializes PubNub
const ChatApp = () => {
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  const activeUserId = query.get('user') || 'default-user';
  const peerUserId = query.get('peer') || 'peer-user';

  // Create a new PubNub instance with a key that includes the user ID to ensure it's recreated when the user changes
  const [pubnub] = useState(() => {
    console.log('Initializing PubNub for user:', activeUserId);
    return new PubNub({
      publishKey: PUBNUB_CONFIG.PUBLISH_KEY,
      subscribeKey: PUBNUB_CONFIG.SUBSCRIBE_KEY,
      uuid: activeUserId,
      // Basic configuration
      logVerbosity: true,
      // Connection and timeout settings
      restore: true,
      keepAlive: true,
      heartbeatInterval: 60,
      presenceTimeout: 120,
      // File upload specific settings
      fileUploadPublishRetryLimit: 5,
      maximumCacheSize: 1000,
      requestMessageCountThreshold: 100,
      // Network timeout settings
      suppressLeaveEvents: false,
      requestTimeout: 60000 // Increase timeout for large messages
    });
  });

  // Log when the component mounts with the current user
  useEffect(() => {
    console.log('ChatApp mounted with user:', activeUserId, 'peer:', peerUserId);

    // Force a channel reset when the component mounts
    const channelName = [activeUserId, peerUserId].sort().join('-');
    console.log('Channel for this chat:', channelName);

    return () => {
      console.log('ChatApp unmounted for user:', activeUserId);
    };
  }, [activeUserId, peerUserId]);

  return (
    <PubNubProvider client={pubnub} key={`${activeUserId}-${peerUserId}`}>
      <div className="chat-app">
        <Chat />
      </div>
    </PubNubProvider>
  );
};

export default ChatApp; 