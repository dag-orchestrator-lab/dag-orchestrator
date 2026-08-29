# 02-contracts.md

## In one paragraph
This technical design contract establishes the specification for a lightweight HTTP web server within the Web Service Gateway context that listens on TCP port 8080 and responds to incoming `GET /` requests with a `200 OK` HTTP status code and the exact plain text payload `"Hello World"`.

## Ubiquitous language
* **HTTP Web Server**: The application process listening for incoming network requests on a designated TCP port.
* **Root Endpoint**: The primary `/` URL path hosted by the HTTP server.
* **Port**: The network port (8080) bound by the server process to accept socket connections.
* **Response Body**: The payload data (`"Hello World"`) sent back to the client over HTTP.

## Bounded context
* **Context**: Web Service Gateway / Application Entrypoint
* **Responsibility**: Manages the socket server lifecycle, accepts inbound HTTP TCP connections, routes incoming request paths, and returns HTTP-compliant responses.

## Aggregates and invariants
* **Aggregates**:
  * `ServerInstance`: Encapsulates the HTTP server lifecycle state (Stopped, Starting, Listening, Error).
* **Invariants**:
  * The server MUST listen on port `8080` by default.
  * A `GET` request to `/` MUST always yield standard HTTP status code `200`.
  * The payload body for `GET /` MUST equal `"Hello World"`.

## Ports
* **Inbound Ports**:
  * TCP Socket Listener on `0.0.0.0:8080` (or `127.0.0.1:8080`).
* **Outbound Ports**:
  * System Console (`stdout` / `stderr`) for operational logs (e.g., server start notifications, port binding errors).

## Events
* `ServerStarted`: Emitted when the server successfully binds to port 8080 and is ready to accept traffic.
* `RequestReceived`: Emitted when an HTTP request arrives at the listener.
* `ResponseSent`: Emitted after the response payload has been written to the socket.
* `ServerStartupFailed`: Emitted if port binding or startup initialization fails.

## Data
* **Request Data**:
  * `HTTP Method`: `GET`
  * `Path`: `/`
* **Response Data**:
  * `Status Code`: `200 OK`
  * `Content-Type`: `text/plain; charset=utf-8`
  * `Body`: `"Hello World"`

## API surface
```http
GET / HTTP/1.1
Host: localhost:8080
```

**Response**:
```http
HTTP/1.1 200 OK
Content-Type: text/plain; charset=utf-8
Content-Length: 11

Hello World
```

## UI/UX & Visual Contract
* No graphical user interface (GUI) is supplied.
* When accessed via a web browser or HTTP client (e.g., `curl http://localhost:8080/`), the user visual display presents raw plain text: `Hello World`.

## Failure semantics
* **Port In Use (`EADDRINUSE`)**: If port 8080 is already occupied, log a fatal error to `stderr` and exit with process code `1`.
* **Unrecognized Route**: Any path other than `/` SHOULD return `404 Not Found`.
* **Unsupported HTTP Method**: Non-`GET` requests to `/` SHOULD return `405 Method Not Allowed` or `404 Not Found`.

## Non-goals
* SSL/TLS termination (HTTPS handling).
* Authentication, rate limiting, or CORS middleware implementation.
* Configuration for dynamic routes or database interactions.
* Support for configurable alternative port flags/environment overrides beyond 8080 unless standard runtime practice allows seamless fallback.