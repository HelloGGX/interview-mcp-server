# Interview MCP Server - Your AI Interview Partner

**Interview MCP Server** is an intelligent server tool designed specifically to enhance the efficiency and quality of technical interviews. It deeply integrates advanced resume analysis capabilities and seamlessly integrates with your favorite mainstream IDEs, transforming tedious interview preparation workflows into an efficient, precise, and enjoyable experience.

[](https://www.google.com/search?q=https://github.com/HelloGGX/interview-mcp-server)

## 💡 Common Challenges Faced by Interviewers

In fast-paced recruitment processes, technical interviewers often face numerous challenges:

  - **Time-consuming question preparation**: Starting from scratch to search and design interview questions based on job requirements.
  - **Difficulty maintaining standards**: How to ensure that interview questions consistently align with the company's tech stack and best practices?
  - **Lack of personalization**: Difficulty conducting in-depth, personalized assessments tailored to each candidate's unique background and skills.
  - **Inefficient evaluation**: Challenges in comprehensively and objectively assessing candidates' overall capabilities during interviews.
  - **Reliance on subjective intuition**: Making decisions based solely on brief interactions can easily lead to talent mismatches with high risks.
  - **Tedious report writing**: Post-interview evaluation report compilation consumes valuable time.

Traditional interview processes are draining our energy to identify excellent talent. It's time for a change!

## ✨ Introducing Interview MCP Server - Welcome to the New Era of Interviews

**Interview MCP Server** infuses AI power into every aspect of the interview process, providing an unprecedented intelligent experience:

  - **🤖 Intelligent Resume Parsing**: No manual input required - automatically extracts key information like candidate names, work experience, and tech stacks from PDF resumes in seconds.
  - **🎯 Precise Question Generation**: Combines resume content with job requirements (such as "Senior Frontend Developer") to generate highly relevant, in-depth interview questions with one click.
  - **🎙️ Real-time Conversation Recording**: After starting the service, use local speech recognition models to transcribe interview conversations into Markdown format in real-time and securely, capturing every detail.
  - **📈 Automated Evaluation Reports**: Combines resume information, preset questions, and interview conversations to automatically generate multi-dimensional, structured comprehensive evaluation reports for data-driven decision making.
  - **🌐 Comprehensive Position Support**: Pre-configured models for various mainstream technical positions including frontend development, backend development, test engineering, and more.
  - **📊 Multi-level Capability Coverage**: Whether junior, mid-level, or senior engineers, generates interview questions appropriate for their skill level.
  - **Multi-dimensional Evaluation System**: Comprehensive assessment across multiple dimensions including technical ability, problem-solving, teamwork, and more to reveal candidates' true profiles.
  - **🔌 Seamless Workflow Integration**: Supports integration with mainstream development tools like VS Code, JetBrains IDEs, allowing you to complete all operations in your most familiar environment.

## 🚀 Quick Start

Experience an unprecedented efficient interview process in just a few simple steps:

1.  **Upload Resume**: Place the candidate's PDF resume in the designated folder.

2.  **Generate Questions**: Select the resume in your IDE and enter a simple command in the AI chat, for example:

    ```bash
    # Generate interview questions for candidate "John Doe" for "Senior Frontend Developer" position
    /q  "John Doe Senior Frontend Developer"
    ```

    Or more simply:

    ```bash
    /q
    ```

    `Interview MCP Server` will immediately analyze the resume and generate a `questions.md` file containing 12 in-depth questions.

3.  **Start Interview**: Enter the `/record` command to start real-time voice recording. Interviewers can conduct conversations based on the questions in `questions.md`. The service will use local models for offline speech recognition to ensure data security and transcribe conversations in real-time to `conversation.md`.

4.  **Generate Report**: After the interview ends, enter the `/evaluate` command. `Interview MCP Server` will intelligently combine the content from `questions.md` and `conversation.md` to generate a comprehensive evaluation report, automatically saved in the current folder.


![Usage Flow](https://hub.gitmirror.com/https://github.com/HelloGGX/interview-mcp-server/blob/main/docs/flow_en.svg)

## 🛠️ Configuration
You need to register an account on OpenRouter and obtain the model_id and api_key.

#### Method 1: Visit https://smithery.ai/server/@HelloGGX/interview-mcp-server and follow the configuration instructions

#### Method 2: Run npm run build locally to get the packaged build/index.js, then configure in .vscode/mcp.json as follows:
```json
{
  "servers": {
    "interview-mcp-server": {
      "type": "stdio",
      "command": "node",
      "args": ["xxxx\\build\\index.js"],
      "env": {
        "OPENROUTER_MODEL_ID": "deepseek/deepseek-chat-v3-0324:free",
        "OPENROUTER_API_KEY": "xxxxxx"
      }
    }
  }
}
```
-----
