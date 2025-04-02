"use client";

import { useEffect, useState } from "react";
import {
  HumanMessage,
  SystemMessage,
  BaseMessage,
  AIMessage,
  mapChatMessagesToStoredMessages,
} from "@langchain/core/messages";
import { message } from "./actions";
import { seed } from "./database";
import React from "react";

// Syntax highlighting helper function with direct JSX output instead of HTML strings
function formatSQLContent(content: string): React.ReactNode {
  // Check if the content contains SQL code
  if (!content.includes("```sql") && !content.includes("SELECT") && !content.includes("FROM")) {
    return <div>{content}</div>;
  }

  // Extract SQL blocks from markdown or plain text
  const sqlRegex = /```sql\s*([\s\S]*?)\s*```|(?<=\n|^)\s*(SELECT|INSERT|UPDATE|DELETE)[\s\S]*?(?:;|\n|$)/gi;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = sqlRegex.exec(content)) !== null) {
    // Add text before the SQL block
    if (match.index > lastIndex) {
      parts.push(<span key={`text-${lastIndex}`}>{content.substring(lastIndex, match.index)}</span>);
    }

    // Format and add the SQL block
    const sqlCode = match[1] || match[0];
    parts.push(
      <div key={`sql-${match.index}`} className="mt-2 mb-2 rounded-md overflow-hidden">
        <div className="bg-gray-800 px-4 py-2 text-xs text-gray-200 flex justify-between items-center">
          <span>SQL Query</span>
          <button 
            className="bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded text-xs"
            onClick={() => navigator.clipboard.writeText(sqlCode)}
          >
            Copy
          </button>
        </div>
        <pre className="bg-gray-700 p-4 text-sm overflow-x-auto">
          {renderSQLSyntax(sqlCode)}
        </pre>
      </div>
    );

    lastIndex = match.index + match[0].length;
  }

  // Add any remaining text
  if (lastIndex < content.length) {
    parts.push(<span key={`text-${lastIndex}`}>{content.substring(lastIndex)}</span>);
  }

  return <div>{parts}</div>;
}

// Render SQL syntax with JSX elements instead of HTML strings
function renderSQLSyntax(sql: string): React.ReactNode[] {
  const lines = sql.split('\n');
  
  return lines.map((line, lineIndex) => {
    const lineNumber = (
      <span key={`line-${lineIndex}`} className="text-gray-500 select-none mr-4">
        {(lineIndex + 1).toString().padStart(2)}
      </span>
    );
    
    // Process the line to add syntax highlighting
    const segments: React.ReactNode[] = [];
    let currentIndex = 0;
    
    // SQL keywords
    const keywordRegex = /\b(SELECT|FROM|WHERE|JOIN|ON|GROUP BY|ORDER BY|HAVING|LIMIT|INSERT|UPDATE|DELETE|SET|VALUES|AND|OR|AS|COUNT|SUM|AVG|MIN|MAX|INNER|OUTER|LEFT|RIGHT)\b/gi;
    let keywordMatch;
    
    while ((keywordMatch = keywordRegex.exec(line)) !== null) {
      // Add text before the keyword
      if (keywordMatch.index > currentIndex) {
        segments.push(
          <span key={`text-${lineIndex}-${currentIndex}`}>
            {line.substring(currentIndex, keywordMatch.index)}
          </span>
        );
      }
      
      // Add the highlighted keyword
      segments.push(
        <span key={`kw-${lineIndex}-${keywordMatch.index}`} className="text-amber-400">
          {keywordMatch[0]}
        </span>
      );
      
      currentIndex = keywordMatch.index + keywordMatch[0].length;
    }
    
    // Add remaining text after last keyword
    if (currentIndex < line.length) {
      // Process strings and numbers in remaining text
      let remainingText = line.substring(currentIndex);
      
      // Double-quoted strings
      remainingText = remainingText.replace(/"([^"]*)"/g, (match, p1) => {
        return `<STRING_DOUBLE>${p1}</STRING_DOUBLE>`;
      });
      
      // Single-quoted strings
      remainingText = remainingText.replace(/'([^']*)'/g, (match, p1) => {
        return `<STRING_SINGLE>${p1}</STRING_SINGLE>`;
      });
      
      // Numbers
      remainingText = remainingText.replace(/\b(\d+)\b/g, (match, p1) => {
        return `<NUMBER>${p1}</NUMBER>`;
      });
      
      // Split by our markers and create spans
      const parts = remainingText.split(/(<\/?STRING_DOUBLE>|<\/?STRING_SINGLE>|<\/?NUMBER>)/);
      let insideDoubleString = false;
      let insideSingleString = false;
      let insideNumber = false;
      
      parts.forEach((part, i) => {
        if (part === '<STRING_DOUBLE>') {
          insideDoubleString = true;
          return;
        } else if (part === '</STRING_DOUBLE>') {
          insideDoubleString = false;
          return;
        } else if (part === '<STRING_SINGLE>') {
          insideSingleString = true;
          return;
        } else if (part === '</STRING_SINGLE>') {
          insideSingleString = false;
          return;
        } else if (part === '<NUMBER>') {
          insideNumber = true;
          return;
        } else if (part === '</NUMBER>') {
          insideNumber = false;
          return;
        }
        
        if (insideDoubleString) {
          segments.push(
            <span key={`str-d-${lineIndex}-${i}`} className="text-emerald-400">"{part}"</span>
          );
        } else if (insideSingleString) {
          segments.push(
            <span key={`str-s-${lineIndex}-${i}`} className="text-sky-400">'{part}'</span>
          );
        } else if (insideNumber) {
          segments.push(
            <span key={`num-${lineIndex}-${i}`} className="text-blue-300">{part}</span>
          );
        } else if (part) {
          segments.push(
            <span key={`text-${lineIndex}-${i}`}>{part}</span>
          );
        }
      });
    }
    
    return (
      <div key={`line-${lineIndex}`} className="whitespace-pre">
        {lineNumber}
        {segments.length > 0 ? segments : line}
      </div>
    );
  });
}

// Interface for table data
interface ResultData {
  [key: string]: string | number | boolean | null;
}

// Component to display execution status and results
function SQLResultDisplay({ result }: { result: string }): React.ReactNode {
  if (!result || !result.includes("Result:")) return null;
  
  const resultIndex = result.indexOf("Result:");
  const sqlPart = result.substring(0, resultIndex).trim();
  const resultPart = result.substring(resultIndex).trim();
  
  try {
    // Try to parse the result as JSON
    const resultJson = resultPart.replace("Result:", "").trim();
    const data = JSON.parse(resultJson) as ResultData[];
    
    return (
      <div className="mt-4">
        {sqlPart && formatSQLContent(sqlPart)}
        <div className="bg-gray-800 px-4 py-2 text-xs text-gray-200">
          Query Result
        </div>
        <div className="bg-gray-700 p-4 rounded-b-md overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-600">
            <thead>
              <tr>
                {Object.keys(data[0] || {}).map((key) => (
                  <th key={key} className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    {key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-600">
              {data.map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-gray-800" : "bg-gray-700"}>
                  {Object.values(row).map((value, j) => (
                    <td key={j} className="px-4 py-2 text-sm text-gray-200">
                      {String(value)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  } catch (e) {
    // If JSON parsing fails, display as text
    return (
      <div className="mt-4">
        {sqlPart && formatSQLContent(sqlPart)}
        <div className="bg-gray-800 px-4 py-2 text-xs text-gray-200">
          Query Result
        </div>
        <div className="bg-gray-700 p-4 rounded-b-md text-white">
          {resultPart.replace("Result:", "").trim()}
        </div>
      </div>
    );
  }
}

// Main component
export default function Home() {
  const [inputMessage, setInputMessage] = useState("");
  const [messages, setMessages] = useState<BaseMessage[]>([
    new SystemMessage(`
      You are an expert SQL assistant. Your task is to generate SQL queries based on user requests. Follow these strict formatting guidelines:
        
      You should create a SQLite query based on natural language. 
      Use the "getFromDB" tool to get data from a database.

      - Always enclose field names and table names in double quotes ("), even if they contain no special characters.
      - Ensure proper SQL syntax and use best practices for readability.
      - Maintain consistency in capitalization (e.g., SQL keywords in uppercase).
    `),
  ]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    seed();
  }, []); // Added empty dependency array to prevent infinite rerenders

  async function sendMessage() {
    if (!inputMessage.trim()) return;
    
    setIsLoading(true);
    const messageHistory = [...messages, new HumanMessage(inputMessage)];

    const response = await message(
      mapChatMessagesToStoredMessages(messageHistory)
    );

    if (response) {
      messageHistory.push(new AIMessage(response as string));
    }

    setMessages(messageHistory);
    setInputMessage("");
    setIsLoading(false);
  }

  // Function to handle SQL code block extraction for display
  const extractAndFormatCodeBlocks = (content: string): React.ReactNode => {
    // This is a simplified version that looks for markdown code blocks
    const parts = content.split(/```sql|```/);
    
    if (parts.length <= 1) {
      // No code blocks found, return the content as is
      return content;
    }
    
    const renderedParts: React.ReactNode[] = [];
    
    parts.forEach((part, index) => {
      if (index === 0 && part) {
        // First part (before any code block)
        renderedParts.push(<span key={`text-${index}`}>{part}</span>);
      } else if (index % 2 === 1) {
        // This is inside a code block
        renderedParts.push(
          <div key={`code-${index}`} className="my-2 bg-gray-800 rounded overflow-hidden">
            <div className="bg-gray-900 px-3 py-1 text-xs text-gray-400">SQL</div>
            <pre className="p-3 text-green-300 overflow-x-scroll">{part}</pre>
          </div>
        );
      } else if (part) {
        // Text between code blocks
        renderedParts.push(<span key={`text-${index}`}>{part}</span>);
      }
    });
    
    return <div>{renderedParts}</div>;
  };

  return (
    <div className="flex flex-col h-screen justify-between">
      <header className="bg-white p-2 shadow-sm">
        <div className="flex lg:flex-1 items-center justify-center">
          <a href="#" className="m-1.5">
            <span className="sr-only">Text-to-SQL Agent</span>
            <img
              className="h-8 w-auto"
              src="http://localhost:3000/watsonx.svg"
              alt=""
            />
          </a>
          <h1 className="text-black font-bold">Text-to-SQL Agent</h1>
        </div>
      </header>
      <div className="flex flex-col h-full p-3 overflow-y-auto bg-gray-50">
        {messages.length > 0 &&
          messages.map((message, index) => {
            if (message instanceof HumanMessage) {
              return (
                <div
                  key={message.getType() + index}
                  className="col-start-1 col-end-8 p-3 rounded-lg"
                >
                  <div className="flex flex-row items-start">
                    <div className="flex items-center justify-center h-8 w-8 rounded-full bg-orange-400 text-white flex-shrink-0 text-sm">
                      Me
                    </div>
                    <div className="relative ml-3 text-sm bg-white py-2 px-4 shadow rounded-xl">
                      <div>{message.content as string}</div>
                    </div>
                  </div>
                </div>
              );
            }

            if (message instanceof AIMessage) {
              const content = message.content as string;
              
              // Check if the message contains SQL code
              const hasSQLCode = content.includes("```sql") || 
                               (content.includes("SELECT") && content.includes("FROM"));
              
              return (
                <div
                  key={message.getType() + index}
                  className="col-start-6 col-end-13 p-3 rounded-lg"
                >
                  <div className="flex items-start justify-start flex-row-reverse">
                    <div className="flex items-center justify-center h-8 w-8 rounded-full bg-green-400 flex-shrink-0 text-sm">
                      AI
                    </div>
                    <div className="relative mr-3 text-sm bg-indigo-100 py-4 px-5 shadow rounded-xl max-w-3xl">
                      {hasSQLCode ? formatSQLContent(content) : <div>{content}</div>}
                      <SQLResultDisplay result={content} />
                    </div>
                  </div>
                </div>
              );
            }
            
            return null; // Return null for other message types
          })}
      </div>
      <div className="flex flex-col flex-auto justify-between bg-gray-100 p-6">
        <div className="top-[100vh] flex flex-row items-center h-16 rounded-xl bg-white w-full px-4 shadow-md">
          <div className="flex-grow ml-4">
            <div className="relative w-full">
              <input
                type="text"
                disabled={isLoading}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                placeholder="Ask a question about your data..."
                className="flex w-full border rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 pl-4 h-10"
              />
            </div>
          </div>
          <div className="ml-4">
            <button
              onClick={sendMessage}
              disabled={isLoading || !inputMessage.trim()}
              className={`flex items-center justify-center rounded-xl text-white px-4 py-2 flex-shrink-0 ${
                isLoading || !inputMessage.trim() ? "bg-indigo-300" : "bg-indigo-500 hover:bg-indigo-600"
              }`}
            >
              <span>{isLoading ? "Loading..." : "Send"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}