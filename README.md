# opencode-chorus

The official [Chorus](https://github.com/Chorus-AIDLC/Chorus) integration plugin for OpenCode. 

This plugin connects OpenCode to your Chorus instance, allowing you to seamlessly interact with the Chorus workflow, manage proposals, execute tasks, and run the full AI-DLC pipeline directly from your OpenCode environment.

## What it does

When enabled, `opencode-chorus` automatically registers a native Chorus MCP server inside OpenCode and injects the complete suite of Chorus workflow skills. You don't need to manually configure tools or link skill directories—the plugin handles the wiring.

The plugin provides lifecycle hooks, 7 distinct workflow skills, and 2 independent review agents to guide you through every stage of the AI-DLC process.

### Features at a Glance

| Feature Category | Components | Description |
|---|---|---|
| **Lifecycle Hooks** | State Management | Keeps your OpenCode session state in sync with the `.chorus` directory. |
| | Native MCP | Automatically registers the native Chorus MCP server. |
| **Review Agents** | Proposal Reviewer | Automated review agent that evaluates proposals and waits for verdicts. |
| | Task Reviewer | Automated review agent that verifies completed tasks. |
| **Workflow Skills** | `chorus` | The entry point. Platform overview, shared tools, and lifecycle rules. |
| | `chorus-idea` | Claim ideas, elaborate on requirements, and confirm with owners. |
| | `chorus-proposal` | Draft PRDs, tech designs, and task dependency graphs. |
| | `chorus-develop` | Implement tasks, report work, and run self-checks before verification. |
| | `chorus-quick-dev` | Handle small changes and hotfixes with optional self-verification. |
| | `chorus-review` | Handle reviewer verdicts, governance, and verification states. |
| | `chorus-yolo` | Execute the full-auto AI-DLC pipeline from prompt to completion. |

> **Note**: You must have a valid Chorus instance (either local or online) running and accessible to use this plugin.

## Getting Started

### 1. Install the Plugin

Install `opencode-chorus` from npm by adding it to your OpenCode configuration.

Edit your OpenCode config file (usually `~/.config/opencode/config.json`) to include the plugin:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-chorus"]
}
```

### 2. Configure Credentials

The plugin needs to know where your Chorus server is and how to authenticate. The easiest way to configure this is using environment variables.

Set these in your terminal before running OpenCode:

```bash
export CHORUS_BASE_URL="http://localhost:3000" # Replace with your Chorus server URL
export CHORUS_API_KEY="your-chorus-api-key"
```

Alternatively, you can create a `chorus.json` file in your OpenCode configuration directory (`~/.config/opencode/chorus.json`):

```json
{
  "chorusUrl": "http://localhost:3000",
  "enableProposalReviewer": true,
  "enableTaskReviewer": true
}
```
*Note: While you can put your API key in `chorus.json`, using the `CHORUS_API_KEY` environment variable is strongly recommended for security.*

### 3. Restart OpenCode

After installing the plugin and setting your credentials, restart OpenCode.

Once restarted, you should see the Chorus skills available in your workspace. You can start by asking OpenCode to use the `chorus` skill to get an overview, or dive right into a specific stage like `chorus-idea` or `chorus-yolo`.
