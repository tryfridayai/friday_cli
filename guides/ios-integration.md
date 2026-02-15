# iOS Integration Guide

Connect your iOS app to a self-hosted Friday runtime via WebSocket.

## Architecture

```
iOS App  ──WebSocket──▶  Friday Server (self-hosted)
                              │
                         Claude API
                              │
                         MCP Tools
```

The iOS app is a thin client. All agent logic, tool execution, and session management happen on the server.

## Setup

1. Deploy Friday server (see [self-hosting.md](./self-hosting.md))
2. Connect from iOS via WebSocket

## Swift WebSocket Client

```swift
import Foundation

class FridayClient: NSObject, URLSessionWebSocketDelegate {
    private var webSocket: URLSessionWebSocketTask?
    private let serverURL: URL
    var onChunk: ((String) -> Void)?
    var onComplete: ((String) -> Void)?
    var onToolUse: ((String) -> Void)?

    init(serverURL: URL) {
        self.serverURL = serverURL
        super.init()
    }

    func connect() {
        let session = URLSession(configuration: .default, delegate: self, delegateQueue: .main)
        webSocket = session.webSocketTask(with: serverURL)
        webSocket?.resume()
        receiveMessage()
    }

    func sendQuery(_ message: String, sessionId: String? = nil) {
        var payload: [String: Any] = ["type": "query", "message": message]
        if let sid = sessionId { payload["session_id"] = sid }

        if let data = try? JSONSerialization.data(withJSONObject: payload),
           let string = String(data: data, encoding: .utf8) {
            webSocket?.send(.string(string)) { error in
                if let error { print("Send error: \(error)") }
            }
        }
    }

    private func receiveMessage() {
        webSocket?.receive { [weak self] result in
            switch result {
            case .success(.string(let text)):
                self?.handleMessage(text)
                self?.receiveMessage()
            case .failure(let error):
                print("Receive error: \(error)")
            default:
                self?.receiveMessage()
            }
        }
    }

    private func handleMessage(_ text: String) {
        guard let data = text.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = json["type"] as? String else { return }

        switch type {
        case "chunk":
            if let chunk = json["text"] as? String {
                onChunk?(chunk)
            }
        case "tool_use":
            if let tool = json["tool"] as? String {
                onToolUse?(tool)
            }
        case "complete":
            if let result = json["result"] as? String {
                onComplete?(result)
            }
        default:
            break
        }
    }

    func disconnect() {
        webSocket?.cancel(with: .normalClosure, reason: nil)
    }
}
```

## Usage in SwiftUI

```swift
struct ChatView: View {
    @State private var messages: [ChatMessage] = []
    @State private var input = ""
    @State private var currentResponse = ""
    private let client = FridayClient(serverURL: URL(string: "ws://your-server:8787")!)

    var body: some View {
        VStack {
            ScrollView {
                ForEach(messages) { msg in
                    MessageBubble(message: msg)
                }
                if !currentResponse.isEmpty {
                    Text(currentResponse)
                        .padding()
                }
            }

            HStack {
                TextField("Ask Friday...", text: $input)
                Button("Send") { sendMessage() }
            }
            .padding()
        }
        .onAppear {
            client.onChunk = { chunk in
                currentResponse += chunk
            }
            client.onComplete = { result in
                messages.append(ChatMessage(role: .assistant, text: currentResponse))
                currentResponse = ""
            }
            client.connect()
        }
    }

    func sendMessage() {
        let text = input
        input = ""
        messages.append(ChatMessage(role: .user, text: text))
        client.sendQuery(text)
    }
}
```

## Permission Handling

The agent may request permission for certain actions (file writes, terminal commands). Handle `permission_request` messages:

```swift
case "permission_request":
    // Show alert to user, send approval/denial back
    let toolName = json["tool"] as? String ?? "unknown"
    showPermissionAlert(for: toolName) { approved in
        let response: [String: Any] = [
            "type": "permission_response",
            "tool": toolName,
            "approved": approved
        ]
        // Send response back via WebSocket
    }
```

## Session Management

Pass a `session_id` with each query to maintain conversation context:

```swift
client.sendQuery("What files did you create?", sessionId: "session-abc-123")
```

Sessions are stored server-side. Use the REST API to list/manage sessions:

```
GET http://your-server:8787/sessions
```
