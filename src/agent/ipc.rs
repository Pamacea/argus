// IPC (Inter-Process Communication) for ARGUS Agent
// Cross-platform communication using Named Pipes (Windows) and Unix Sockets (Unix)

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::Duration;

use super::{AgentRequest, AgentResponse};

/// IPC transport abstraction for cross-platform communication
#[derive(Debug, Clone)]
pub enum IpcTransport {
    NamedPipe(String),  // Windows - pipe name
    UnixSocket(PathBuf), // Linux/macOS
}

impl IpcTransport {
    /// Create IPC transport for the current platform
    pub fn for_platform() -> Result<Self> {
        #[cfg(windows)]
        {
            return Ok(IpcTransport::NamedPipe(r"\\.\pipe\argus-ipc".to_string()));
        }

        #[cfg(unix)]
        {
            let base = std::env::home_dir()
                .ok_or_else(|| anyhow::anyhow!("Cannot determine home directory"))?;
            let socket_path = base.join(".argus").join("argus.sock");
            return Ok(IpcTransport::UnixSocket(socket_path));
        }

        #[cfg(not(any(windows, unix)))]
        compile_error!("Unsupported platform for IPC");
    }

    /// Get the socket/pipe path for display purposes
    pub fn path(&self) -> String {
        match self {
            IpcTransport::NamedPipe(p) => p.clone(),
            IpcTransport::UnixSocket(p) => p.to_string_lossy().to_string(),
        }
    }
}

/// IPC Client for sending requests to the ARGUS agent
pub struct IpcClient {
    transport: IpcTransport,
    timeout: Duration,
}

impl IpcClient {
    /// Create a new IPC client
    pub fn new() -> Result<Self> {
        Ok(Self {
            transport: IpcTransport::for_platform()?,
            timeout: Duration::from_secs(5),
        })
    }

    /// Create client with custom timeout
    pub fn with_timeout(timeout: Duration) -> Result<Self> {
        Ok(Self {
            transport: IpcTransport::for_platform()?,
            timeout,
        })
    }

    /// Send request and wait for response
    pub fn send(&self, request: &AgentRequest) -> Result<AgentResponse> {
        match &self.transport {
            IpcTransport::NamedPipe(pipe_name) => {
                #[cfg(windows)]
                return self.send_named_pipe(pipe_name, request);
                #[cfg(not(windows))]
                return Err(anyhow::anyhow!("Named pipes not supported on this platform"));
            }
            IpcTransport::UnixSocket(path) => {
                #[cfg(unix)]
                return self.send_unix_socket(path, request);
                #[cfg(not(unix))]
                return Err(anyhow::anyhow!("Unix sockets not supported on this platform"));
            }
        }
    }

    /// Send via Windows Named Pipe
    #[cfg(windows)]
    fn send_named_pipe(&self, pipe_name: &str, request: &AgentRequest) -> Result<AgentResponse> {
        use std::io::{BufRead, BufReader, Write};
        use std::os::windows::fs::OpenOptionsExt;

        const PIPE_ACCESS_DUPLEX: u32 = 0x00000003;
        const FILE_FLAG_OVERLAPPED: u32 = 0x40000000;
        const GENERIC_READ: u32 = 0x80000000;
        const GENERIC_WRITE: u32 = 0x40000000;
        const OPEN_EXISTING: u32 = 3;

        // Try to connect with timeout
        let start = std::time::Instant::now();

        loop {
            // Use Windows-specific approach to open named pipe
            let result = unsafe {
                let handle = windows_sys::Win32::Storage::FileSystem::CreateFileW(
                    windows_sys::core::PCWSTR(to_wide(pipe_name).as_ptr()),
                    GENERIC_READ | GENERIC_WRITE,
                    0,
                    std::ptr::null_mut(),
                    OPEN_EXISTING,
                    FILE_FLAG_OVERLAPPED,
                    std::ptr::null_mut(),
                );

                if handle == windows_sys::Win32::Foundation::INVALID_HANDLE_VALUE {
                    Err(std::io::Error::last_os_error())
                } else {
                    Ok(std::os::windows::io::OwnedHandle::from_raw_handle(handle as isize))
                }
            };

            match result {
                Ok(handle) => {
                    // Convert to std::fs::File for easier I/O
                    let stream = std::fs::File::from(handle);

                    // Serialize and send request
                    let json = serde_json::to_string(request)?;
                    let mut writer = std::io::BufWriter::new(&stream);
                    writeln!(writer, "{}", json)?;
                    writer.flush()?;

                    // Read response
                    let reader = BufReader::new(&stream);
                    let line = reader.lines().next()
                        .ok_or_else(|| anyhow::anyhow!("No response from agent"))??;

                    let response: AgentResponse = serde_json::from_str(&line)?;
                    return Ok(response);
                }
                Err(e) if e.raw_os_error() == Some(2) => {
                    // ERROR_FILE_NOT_FOUND - pipe not created yet
                    if start.elapsed() < self.timeout {
                        std::thread::sleep(Duration::from_millis(100));
                        continue;
                    }
                    return Err(anyhow::anyhow!(
                        "ARGUS agent is not running. Start it with: argus daemon start"
                    ));
                }
                Err(_) if start.elapsed() < self.timeout => {
                    std::thread::sleep(Duration::from_millis(100));
                    continue;
                }
                Err(e) => return Err(e.into()),
            }
        }
    }

    /// Send via Unix Socket
    #[cfg(unix)]
    fn send_unix_socket(&self, path: &PathBuf, request: &AgentRequest) -> Result<AgentResponse> {
        use std::io::{BufRead, BufReader, Write};
        use std::os::unix::net::UnixStream;

        let start = std::time::Instant::now();

        loop {
            match UnixStream::connect(path) {
                Ok(mut stream) => {
                    stream.set_read_timeout(Some(self.timeout))?;
                    stream.set_write_timeout(Some(self.timeout))?;

                    // Serialize and send request
                    let json = serde_json::to_string(request)?;
                    writeln!(stream, "{}", json)?;

                    // Read response
                    let reader = BufReader::new(stream);
                    let line = reader.lines().next()
                        .ok_or_else(|| anyhow::anyhow!("No response from agent"))??;

                    let response: AgentResponse = serde_json::from_str(&line)?;
                    return Ok(response);
                }
                Err(_) if start.elapsed() < self.timeout => {
                    std::thread::sleep(Duration::from_millis(100));
                    continue;
                }
                Err(e) => {
                    return Err(anyhow::anyhow!(
                        "Failed to connect to ARGUS agent: {}. Is it running?",
                        e
                    ));
                }
            }
        }
    }

    /// Check if agent is running
    pub fn ping(&self) -> bool {
        let request = AgentRequest {
            session_id: "ping".to_string(),
            action: super::AgentAction::Ping,
        };

        self.send(&request).is_ok()
    }
}

impl Default for IpcClient {
    fn default() -> Self {
        Self::new().unwrap_or_else(|_| {
            Self {
                transport: IpcTransport::UnixSocket(PathBuf::from("/tmp/argus.sock")),
                timeout: Duration::from_secs(5),
            }
        })
    }
}

/// IPC Server for the ARGUS agent
pub struct IpcServer {
    transport: IpcTransport,
}

impl IpcServer {
    /// Create a new IPC server
    pub fn new() -> Result<Self> {
        Ok(Self {
            transport: IpcTransport::for_platform()?,
        })
    }

    /// Start the server and handle incoming requests
    pub fn run<F>(&self, handler: F) -> Result<()>
    where
        F: Fn(AgentRequest) -> AgentResponse + Send + Sync + 'static,
    {
        let handler = std::sync::Arc::new(handler);
        match &self.transport {
            IpcTransport::NamedPipe(pipe_name) => {
                #[cfg(windows)]
                return self.run_named_pipe(pipe_name.clone(), handler);
                #[cfg(not(windows))]
                return Err(anyhow::anyhow!("Named pipes not supported on this platform"));
            }
            IpcTransport::UnixSocket(path) => {
                #[cfg(unix)]
                return self.run_unix_socket(path.clone(), handler);
                #[cfg(not(unix))]
                return Err(anyhow::anyhow!("Unix sockets not supported on this platform"));
            }
        }
    }

    /// Run Windows Named Pipe server
    #[cfg(windows)]
    fn run_named_pipe<F>(&self, pipe_name: String, handler: std::sync::Arc<F>) -> Result<()>
    where
        F: Fn(AgentRequest) -> AgentResponse + Send + Sync + 'static,
    {
        use std::io::{BufRead, BufReader, Write};
        use std::sync::atomic::{AtomicBool, Ordering};
        use std::sync::Arc;

        // Flag to control server loop
        let running = Arc::new(AtomicBool::new(true));
        let r = running.clone();

        // Set up Ctrl+C handler
        ctrlc::set_handler(move || {
            println!("\n[ARGUS] Shutting down daemon...");
            r.store(false, Ordering::SeqCst);
        }).ok();

        println!("🤖 ARGUS Agent starting...");
        println!("📍 IPC: {}", pipe_name);

        let handle = std::thread::spawn(move || {
            while running.load(Ordering::SeqCst) {
                match create_and_serve_pipe(&pipe_name, &handler) {
                    Ok(_) => {}
                    Err(e) if running.load(Ordering::SeqCst) => {
                        eprintln!("Pipe error: {}", e);
                        std::thread::sleep(Duration::from_secs(1));
                    }
                    Err(_) => break,
                }
            }
        });

        handle.join().ok();
        Ok(())
    }

    /// Run Unix Socket server
    #[cfg(unix)]
    fn run_unix_socket<F>(&self, path: PathBuf, handler: std::sync::Arc<F>) -> Result<()>
    where
        F: Fn(AgentRequest) -> AgentResponse + Send + Sync + 'static,
    {
        use std::io::{BufRead, BufReader, Write};
        use std::os::unix::net::UnixListener;

        // Remove existing socket if present
        let _ = std::fs::remove_file(&path);

        let listener = UnixListener::bind(&path)
            .context("Failed to bind Unix socket")?;

        println!("ARGUS Agent listening on: {}", path.display());

        for stream in listener.incoming() {
            match stream {
                Ok(stream) => {
                    let h = handler.clone();
                    std::thread::spawn(move || {
                        let reader = BufReader::new(&stream);
                        let mut writer = &stream;

                        for line in reader.lines() {
                            if let Ok(line) = line {
                                if let Ok(request) = serde_json::from_str::<AgentRequest>(&line) {
                                    let response = h(request);
                                    let _ = writeln!(writer, "{}", serde_json::to_string(&response).unwrap_or_default());
                                }
                            }
                        }
                    });
                }
                Err(e) => {
                    eprintln!("Connection failed: {}", e);
                }
            }
        }

        Ok(())
    }
}

/// Windows helper: Create and serve a single named pipe connection
#[cfg(windows)]
fn create_and_serve_pipe<F>(
    pipe_name: &str,
    handler: &Arc<F>,
) -> Result<()>
where
    F: Fn(AgentRequest) -> AgentResponse + Send + Sync + 'static,
{
    use std::io::{BufRead, BufReader, Write};
    use std::sync::Arc;

    const PIPE_ACCESS_DUPLEX: u32 = 0x00000003;
    const PIPE_TYPE_MESSAGE: u32 = 0x00000004;
    const PIPE_READMODE_MESSAGE: u32 = 0x00000002;
    const PIPE_WAIT: u32 = 0x00000000;
    const NMPWAIT_USE_DEFAULT_WAIT: u32 = 0;
    const UNNAMED: u16 = 0;

    let pipe_name_wide = to_wide(pipe_name);

    unsafe {
        let handle = windows_sys::Win32::Storage::FileSystem::CreateNamedPipeW(
            windows_sys::core::PCWSTR(pipe_name_wide.as_ptr()),
            PIPE_ACCESS_DUPLEX,
            PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT,
            1, // Max instances
            512, // Out buffer size
            512, // In buffer size
            0, // Default timeout
            std::ptr::null_mut(),
        );

        if handle == windows_sys::Win32::Foundation::INVALID_HANDLE_VALUE {
            return Err(std::io::Error::last_os_error().into());
        }

        // Wait for client connection
        let connected = windows_sys::Win32::Storage::FileSystem::ConnectNamedPipe(
            handle,
            std::ptr::null_mut(),
        );

        if connected == 0 && windows_sys::Win32::Foundation::GetLastError() != 535 {
            // ERROR_PIPE_CONNECTED (535) is actually OK - client already connected
            windows_sys::Win32::Storage::FileSystem::CloseHandle(handle);
            return Err(std::io::Error::last_os_error().into());
        }

        // Handle connection in a thread
        let h = handler.clone();
        std::thread::spawn(move || {
            let stream = std::os::windows::io::OwnedHandle::from_raw_handle(handle as isize);
            let file = std::fs::File::from(stream);
            let reader = BufReader::new(&file);

            for line in reader.lines() {
                if let Ok(line) = line {
                    if let Ok(request) = serde_json::from_str::<AgentRequest>(&line) {
                        let response = h(request);
                        let json = serde_json::to_string(&response).unwrap_or_default();
                        let mut writer = std::io::BufWriter::new(&file);
                        let _ = writeln!(writer, "{}", json);
                        let _ = writer.flush();
                    }
                }
            }
        });
    }

    Ok(())
}

/// Windows helper: Convert string to wide string
#[cfg(windows)]
fn to_wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ipc_transport_creation() {
        let transport = IpcTransport::for_platform();
        assert!(transport.is_ok());
    }

    #[test]
    fn test_ipc_client_creation() {
        let client = IpcClient::new();
        assert!(client.is_ok());
    }

    #[test]
    fn test_request_serialization() {
        let request = AgentRequest {
            session_id: "test".to_string(),
            action: super::AgentAction::Ping,
        };

        let json = serde_json::to_string(&request);
        assert!(json.is_ok());
    }
}
