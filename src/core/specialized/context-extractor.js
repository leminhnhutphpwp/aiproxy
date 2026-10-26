function extractTextContent(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.filter(c => c.type === 'text').map(c => c.text).join(' ');
  }
  return '';
}

function parseArgs(argsStr) {
  if (!argsStr) return {};
  try { return JSON.parse(argsStr); }
  catch { return {}; }
}

function extractErrorFile(text) {
  const match = text.match(/(?:in|at|File:\s*)([\w\/\.\-]+\.(?:php|js|css|html|py|jsx|tsx|ts)):?(\d+)?/);
  return match ? match[1] : null;
}

function extractErrorLine(text) {
  const match = text.match(/line\s+(\d+)/i);
  return match ? parseInt(match[1]) : null;
}

function inferTopic(queries, toolContext) {
  const allText = queries.join(' ').toLowerCase();
  const files = [...toolContext.filesRead.map(f => f.path), ...toolContext.filesWritten.map(f => f.path)];
  const fileNames = files.map(f => f.split('/').pop()).join(' ').toLowerCase();

  const topicPatterns = [
    { pattern: /register_post_type|cpt|post.type|custom post/i, topic: 'custom-post-type' },
    { pattern: /woocommerce|woo_|product|order|cart|checkout|wc_/i, topic: 'woocommerce' },
    { pattern: /gutenberg|block[_\s]editor|register_block|block.json|innerblocks/i, topic: 'block-editor' },
    { pattern: /theme|template|functions\.php|style\.css|get_template|enqueue/i, topic: 'theme-development' },
    { pattern: /plugin|add_action|add_filter|register_activation|plugin_dir/i, topic: 'plugin-development' },
    { pattern: /sanitize|escape|nonce|csrf|xss|sql.injection|capabilit/i, topic: 'security' },
    { pattern: /wpdb|database|query|prepare|wp_cache|transient/i, topic: 'database' },
    { pattern: /rest.api|endpoint|register_rest_route|wp.json/i, topic: 'rest-api' },
    { pattern: /error|bug|fix|undefined|fatal|exception|debug/i, topic: 'debugging' },
    { pattern: /cache|performance|optimize|lazy|webp|defer/i, topic: 'performance' },
    { pattern: /deploy|migrate|backup|wp.cli|staging|rsync/i, topic: 'devops' },
    { pattern: /meta.box|meta_key|metabox|add_meta_box/i, topic: 'metaboxes' },
    { pattern: /shortcode|add_shortcode/i, topic: 'shortcodes' },
    { pattern: /widget|register_widget|wp_widget/i, topic: 'widgets' },
    { pattern: /wp_query|the_loop|have_posts|get_posts/i, topic: 'wp-query' },
    { pattern: /form|ajax|handle|submit|wp_ajax/i, topic: 'forms-ajax' },
    { pattern: /menu|nav_menu|register_nav|walker/i, topic: 'menus' },
    { pattern: /image|thumbnail|add_image_size|the_post_thumbnail/i, topic: 'images' },
    { pattern: /user|role|permis|current_user_can|wp_user/i, topic: 'users' },
  ];

  for (const { pattern, topic } of topicPatterns) {
    if (pattern.test(allText + ' ' + fileNames)) return topic;
  }

  return 'general';
}

function detectCodePatterns(toolContext) {
  const patterns = [];
  const frameworkHints = [];

  for (const file of toolContext.filesWritten) {
    const path = file.path || '';
    if (path.includes('functions.php')) frameworkHints.push('theme-development');
    if (path.includes('plugin')) frameworkHints.push('plugin-development');
    if (path.includes('woocommerce') || path.includes('woo-')) frameworkHints.push('woocommerce');
    if (path.includes('block') || path.includes('gutenberg')) frameworkHints.push('block-editor');
    if (path.includes('theme')) frameworkHints.push('theme-development');
  }

  for (const error of toolContext.errors) {
    if (error.message.includes('register_post_type')) patterns.push('register_post_type');
    if (error.message.includes('add_action')) patterns.push('add_action');
    if (error.message.includes('wp_enqueue')) patterns.push('wp_enqueue');
    if (error.message.includes('get_post_meta')) patterns.push('get_post_meta');
    if (error.message.includes('update_post_meta')) patterns.push('update_post_meta');
    if (error.message.includes('wp_nonce') || error.message.includes('nonce')) patterns.push('nonce');
  }

  return { codePatterns: [...new Set(patterns)], frameworkHints: [...new Set(frameworkHints)] };
}

function isToolRelated(msg) {
  return msg.role === 'tool' || msg.role === 'function' || (msg.role === 'assistant' && msg.tool_calls);
}

function extractConversationContext(messages) {
  const context = {
    currentQuery: '',
    conversationTopic: 'general',
    recentQueries: [],
    toolContext: {
      filesRead: [],
      filesWritten: [],
      filesEdited: [],
      errors: [],
      commandsRun: [],
    },
    codeContext: {
      activeFiles: [],
      codePatterns: [],
      frameworkHints: [],
    },
    turnCount: 0,
    hasToolCalls: false,
    hasErrors: false,
  };

  if (!messages || !Array.isArray(messages)) return context;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.role === 'user') {
      const text = extractTextContent(msg.content);
      if (text && text.trim()) {
        context.recentQueries.push(text.trim());
        context.turnCount++;
      }
    }

    if (msg.role === 'assistant' && msg.tool_calls) {
      context.hasToolCalls = true;
      for (const tc of msg.tool_calls) {
        const func = tc.function;
        const args = parseArgs(func.arguments);

        if (/read/i.test(func.name) && args.path) {
          context.toolContext.filesRead.push({ path: args.path });
        }
        if (/write/i.test(func.name) && args.path) {
          context.toolContext.filesWritten.push({ path: args.path, content: (args.content || '').slice(0, 200) });
        }
        if (/edit/i.test(func.name) && args.path) {
          context.toolContext.filesEdited.push({ path: args.path });
        }
        if (/bash|command|run|exec/i.test(func.name) && args.command) {
          context.toolContext.commandsRun.push({ command: args.command });
        }
        if (/glob|search|find|grep|read/i.test(func.name)) {
          if (args.pattern) context.toolContext.filesRead.push({ path: args.pattern });
          if (args.path) context.toolContext.filesRead.push({ path: args.path });
        }
      }
    }

    if (msg.role === 'tool') {
      const text = extractTextContent(msg.content);
      if (text && text.length > 0) {
        const errorPatterns = [
          /(?:Fatal|Error|Exception|Warning|Notice):/i,
          /undefined\s+(variable|function|property|index)/i,
          /cannot\s+(call|use|read|find|open)/i,
          /failed|failure|refused|denied/i,
          /syntax\s+error/i,
          /parse\s+error/i,
          /500\s+Internal/i,
          /404\s+Not\s+Found/i,
        ];

        const hasError = errorPatterns.some(p => p.test(text));
        if (hasError) {
          context.hasErrors = true;
          context.toolContext.errors.push({
            message: text.slice(0, 300),
            file: extractErrorFile(text),
            line: extractErrorLine(text),
            timestamp: Date.now(),
          });
        }
      }
    }
  }

  context.currentQuery = context.recentQueries.length > 0
    ? context.recentQueries[context.recentQueries.length - 1]
    : '';

  context.recentQueries = context.recentQueries.slice(-5);

  context.conversationTopic = inferTopic(context.recentQueries, context.toolContext);

  const codeCtx = detectCodePatterns(context.toolContext);
  context.codeContext.codePatterns = codeCtx.codePatterns;
  context.codeContext.frameworkHints = codeCtx.frameworkHints;

  const allFiles = new Set();
  for (const f of context.toolContext.filesRead) allFiles.add(f.path);
  for (const f of context.toolContext.filesWritten) allFiles.add(f.path);
  for (const f of context.toolContext.filesEdited) allFiles.add(f.path);
  context.codeContext.activeFiles = [...allFiles].filter(Boolean);

  return context;
}

function buildEnrichedQuery(context, sessionCtx, config) {
  let query = context.currentQuery;

  const addTag = (tag, value) => {
    query += ` [${tag}: ${value}]`;
  };

  if (context.conversationTopic && context.conversationTopic !== 'general') {
    addTag('Topic', context.conversationTopic);
  }

  if (context.codeContext.activeFiles.length > 0) {
    const fileNames = context.codeContext.activeFiles.slice(0, 3).map(f => f.split('/').pop()).join(', ');
    addTag('ActiveFiles', fileNames);
  }

  if (context.toolContext.errors.length > 0) {
    const recentError = context.toolContext.errors[context.toolContext.errors.length - 1];
    addTag('Error', (recentError.file || '') + (recentError.line ? ':' + recentError.line : ''));
  }

  if (context.codeContext.frameworkHints.length > 0) {
    addTag('Framework', context.codeContext.frameworkHints.slice(0, 2).join(', '));
  }

  if (context.codeContext.codePatterns.length > 0) {
    addTag('Pattern', context.codeContext.codePatterns.slice(0, 3).join(', '));
  }

  if (sessionCtx) {
    if (sessionCtx.activeFiles.length > 0) {
      const sessionFiles = sessionCtx.activeFiles.slice(0, 3).map(f => f.split('/').pop()).join(', ');
      addTag('SessionFiles', sessionFiles);
    }
    if (sessionCtx.frameworkHints.length > 0) {
      addTag('SessionFramework', sessionCtx.frameworkHints.slice(0, 2).join(', '));
    }
    if (sessionCtx.recentTopics.length > 1) {
      const topics = sessionCtx.recentTopics.filter(t => t !== 'general').slice(-3);
      if (topics.length > 0) {
        addTag('SessionTopics', topics.join(', '));
      }
    }
    addTag('Turn', String(sessionCtx.turnCount + 1));
  }

  return query;
}

module.exports = {
  extractConversationContext,
  buildEnrichedQuery,
  extractTextContent,
  inferTopic,
  detectCodePatterns,
};
