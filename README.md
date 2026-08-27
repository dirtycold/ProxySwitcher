# Proxy Switcher

A deliberately small Chrome extension that switches between the operating
system's proxy configuration and a configurable proxy chain.

## Use

1. Load this directory from `chrome://extensions` using **Load unpacked**.
2. Pin **Proxy Switcher** to the toolbar.
3. Click its icon to switch modes:
   - `S` — system proxy
   - `P` — configured proxy chain
   - `?` — another Chrome proxy mode
   - `!` — proxy control is unavailable or an operation failed
4. Right-click the icon and choose **Options** to configure the HTTP and SOCKS5
   endpoints and no-proxy rules.

Settings are stored locally because proxy endpoints are commonly
machine-specific. Saving while the proxy chain is active applies the new
endpoints immediately.

## Proxy behavior

When enabled, the generated PAC script returns this ordered proxy list:

```text
HTTP proxy -> SOCKS5 proxy
```

Chrome falls back to SOCKS5 for eligible connection-level HTTP proxy failures.
Fallback is stateful, so Chrome can temporarily deprioritize a proxy it
considers bad. No `DIRECT` fallback is provided for other traffic.

The no-proxy list defaults to `localhost,127.0.0.1,::1,.local`. Exact entries
match exact hosts or IP addresses, while a leading dot matches subdomains. For
example, `.local` matches `printer.local` but not `local`. Use `*` to bypass the
proxy for every host, or clear the field to rely only on Chrome's implicit
loopback exceptions.

SOCKS5 authentication is not supported by Chrome's proxy stack, so the settings
contain host and port fields only.

## License

This project is released into the public domain under the [Unlicense](UNLICENSE).
