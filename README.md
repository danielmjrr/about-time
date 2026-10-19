# About Time

A small time tracker for client work. It runs on your Mac and opens in your browser. Your data stays on your Mac in one JSON file.

## Features

- A month calendar. Click a day to log time for a client.
- Enter hours as `2h`, `1:30`, `90m` or `1.5`, or enter a start time and an end time.
- Mark each entry as work or a meeting, and as remote or in-office.
- Log leave: sick, holiday, vacation or other. A holiday removes that workday from the target.
- Totals for the week and the month: hours against a target, man-days, earnings for each currency, and the remote share.
- An hourly rate and a currency for each client. Archive a client to hide it but keep its hours.

## Requirements

- macOS with `/usr/bin/python3`. If it is not installed, run `xcode-select --install`.
- To build the Dock app: `swift`, which is part of the Xcode Command Line Tools.
- To run the tests: Node.js 18 or later.

## Install

1. Clone this repository.
2. In the repository folder, run `./make-app.sh`. This builds `About Time.app` in the same folder.
3. Drag `About Time.app` to the Dock.

## Use

Click **About Time** in the Dock. The first click starts a local server on `http://localhost:47890` and opens the page. The server keeps running until you log out.

To use it without the Dock app, run `python3 server.py`, then open `http://localhost:47890`.

## Files

- Data: `~/Library/Application Support/AboutTime/data.json`
- Backups: one copy each day in `~/Library/Application Support/AboutTime/backups/`
- Server log: `~/Library/Application Support/AboutTime/server.log`

## Change the app

- Run the tests with `node test.js`.
- After you edit `server.py` or `web/`, run `./make-app.sh` again. The Dock app uses its own copy of these files.
- After you move this folder, run `./make-app.sh`, then add `About Time.app` to the Dock again.
- To stop the server, run `pkill -f "About Time.app/Contents/Resources/server.py"`.
