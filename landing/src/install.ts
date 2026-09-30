export const INSTALL_PROMPT = `Install Goally (Cursor plugin) for me:

1. Clone: git clone https://github.com/jindratilk/goally && cd goally
2. Run: ./scripts/install.sh
   (builds the dashboard, installs the plugin to ~/.cursor/plugins/local/goally, starts the daemon on 127.0.0.1:4777)
3. In Cursor: Developer: Reload Window
4. Enable Settings → Beta → "Allow CLI to access desktop agents" (Desktop Bridge), then restart Cursor if prompted
5. In a chat run /goally-setup
6. Start a mission: /goally <your big task>
7. Verify with: goally doctor`

export const GITHUB_URL = 'https://github.com/jindratilk/goally'
