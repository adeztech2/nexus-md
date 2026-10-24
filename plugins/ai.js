import { ctxInfo } from '../lib/utils.js'
import { nexusBox, nexusHint } from '../lib/nexusStyle.js'
import { askAI, hasAI, aiInfo, supportsVision } from '../lib/ai.js'
import { chatbot, setChatbotMode, clearChatbotMemory } from '../lib/chatbot.js'

const history = new Map() // chat -> [{role, content}]

const STYLE = 'You are the assistant inside a WhatsApp bot called NEXUS MD. Use plain text. For bold use single asterisks like *this*. No markdown headers, no tables. Keep it clear and not too long.'
const NO_KEY = 'AI is not set up. In Render → Environment add GROQ_API_KEY (free) or ANTHROPIC_API_KEY.'
const OWNER_NUMBER = process.env.OWNER_NUMBER || '254111783552'

// Text of the message being replied to
function quotedText(content) {
  const q = ctxInfo(content).quotedMessage
  return q?.conversation || q?.extendedTextMessage?.text || q?.imageMessage?.caption || q?.videoMessage?.caption || ''
}
const textOf = (ctx) => ctx.body || quotedText(ctx.content)

// Builds a one-shot AI command: input(ctx) returns the prompt, or null to show the usage hint
function tool({ name, aliases, desc, icon, title, usage, system, input, max = 1000 }) {
  return {
    name, aliases, category: 'AI', desc,
    async run(ctx) {
      if (!hasAI()) return ctx.reply(nexusHint(NO_KEY))
      const prompt = input ? input(ctx) : textOf(ctx)
      if (!prompt) return ctx.reply(nexusHint(`Use: ${ctx.prefix}${usage}`))
      try {
        const out = await askAI(`${STYLE} ${system}`, [{ role: 'user', content: prompt }], max)
        await ctx.reply(nexusBox(`${icon} *${title}*`, [out.slice(0, 3500)]))
      } catch (e) {
        await ctx.reply(nexusHint('❌ AI error: ' + e.message))
      }
    }
  }
}

// Short way to define simple tools: t(name, aliases, desc, icon, title, usage, system, max)
const t = (name, aliases, desc, icon, title, usage, system, max = 900) =>
  tool({ name, aliases, desc, icon, title, usage, system, max })

export default [
  // ───── Chat ─────
  {
    name: 'ai', aliases: ['ask', 'gpt', 'chat'], category: 'AI', desc: 'Chat with AI (.ai reset to clear)',
    async run({ jid, body, reply, prefix }) {
      if (!hasAI()) return reply(nexusHint(NO_KEY))
      if (!body) return reply(nexusHint(`Ask something, e.g. ${prefix}ai explain how rainbows form`))
      if (body.toLowerCase() === 'reset') { history.delete(jid); return reply(nexusBox('🧹 *AI*', ['Conversation cleared.'])) }
      const msgs = [...(history.get(jid) || []), { role: 'user', content: body }].slice(-10)
      try {
        const out = await askAI(`${STYLE} Keep answers short and clear.`, msgs)
        history.set(jid, [...msgs, { role: 'assistant', content: out }].slice(-10))
        await reply(nexusBox('🤖 *NEXUS AI*', [out.slice(0, 3500)]))
      } catch (e) { await reply(nexusHint('❌ AI error: ' + e.message)) }
    }
  },
  {
    name: 'aireset', aliases: ['clearai'], category: 'AI', desc: 'Clear the AI conversation',
    async run({ jid, reply }) { history.delete(jid); await reply(nexusBox('🧹 *AI*', ['Conversation cleared.'])) }
  },
  {
    name: 'aistatus', aliases: ['aicheck'], category: 'AI', desc: 'Check that the AI is set up and working',
    async run({ reply }) {
      const info = aiInfo()
      if (!info) return reply(nexusHint(NO_KEY))
      try {
        const out = await askAI('Reply with the single word: OK', [{ role: 'user', content: 'ping' }], 10)
        await reply(nexusBox('🩺 *AI STATUS*', [`Provider: ${info.provider}`, `Model: ${info.model}`, `Test: ✅ ${out.slice(0, 20)}`, `Chatbot: ${chatbot.mode}`]))
      } catch (e) {
        await reply(nexusBox('🩺 *AI STATUS*', [`Provider: ${info.provider}`, `Model: ${info.model}`, `Test: ❌ ${e.message}`]))
      }
    }
  },

  // ───── Chatbot (auto-reply) ─────
  {
    name: 'chatbot', aliases: ['autoreply'], category: 'AI', desc: 'Auto-reply bot: on, dm, groups, off, clear (owner)',
    async run({ m, body, reply, prefix }) {
      const sender = String(m.key.participant || m.key.remoteJid || '').split('@')[0].split(':')[0]
      if (!m.key.fromMe && sender !== OWNER_NUMBER) return reply(nexusHint('Only the owner can change the chatbot.'))
      const arg = (body || '').trim().toLowerCase()
      const modes = { on: 'all', all: 'all', dm: 'dm', private: 'dm', groups: 'groups', group: 'groups', off: 'off' }
      if (arg === 'clear') { clearChatbotMemory(); return reply(nexusBox('🧹 *CHATBOT*', ['Memory cleared.'])) }
      if (!arg || arg === 'status') {
        return reply(nexusBox('💬 *CHATBOT*', [
          `Mode: ${chatbot.mode}`,
          `${prefix}chatbot dm — reply to private chats`,
          `${prefix}chatbot groups — reply in groups when mentioned or replied to`,
          `${prefix}chatbot on — both`,
          `${prefix}chatbot off — stop`,
          `${prefix}chatbot clear — forget chats`,
        ]))
      }
      if (!modes[arg]) return reply(nexusHint(`Use: ${prefix}chatbot on | dm | groups | off | clear`))
      if (modes[arg] !== 'off' && !hasAI()) return reply(nexusHint(NO_KEY))
      setChatbotMode(modes[arg])
      await reply(nexusBox('💬 *CHATBOT*', [`Mode is now: ${modes[arg]}`]))
    }
  },

  // ───── Images ─────
  {
    name: 'imagine', aliases: ['draw', 'dalle', 'flux'], category: 'AI', desc: 'Make a picture from text, e.g. .imagine a lion at sunset',
    async run({ sock, jid, m, body, reply, prefix }) {
      const prompt = (body || '').trim()
      if (!prompt) return reply(nexusHint(`Use: ${prefix}imagine a lion at sunset`))
      if (/\b(nude|naked|porn|sex|nsfw|erotic|child|kid|minor)\b/i.test(prompt)) return reply(nexusHint('I cannot make that kind of picture.'))
      try {
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=768&height=768&nologo=true&seed=${Math.floor(Math.random() * 1e6)}`
        const res = await fetch(url, { signal: AbortSignal.timeout(60000) })
        if (!res.ok) throw new Error('HTTP ' + res.status)
        const buf = Buffer.from(await res.arrayBuffer())
        if (buf.length < 2000) throw new Error('empty image')
        await sock.sendMessage(jid, { image: buf, caption: `🎨 ${prompt}`.slice(0, 200) }, { quoted: m })
      } catch (e) {
        console.log('❌ imagine failed:', e.message)
        await reply(nexusHint('Could not make the picture right now. Try again in a moment.'))
      }
    }
  },
  {
    name: 'vision', aliases: ['describe', 'lookat'], category: 'AI', desc: 'AI describes an image, e.g. reply to a photo with .vision what is this?',
    async run({ sock, m, body, reply }) {
      if (!hasAI()) return reply(nexusHint(NO_KEY))
      if (!supportsVision()) return reply(nexusHint('Image reading needs ANTHROPIC_API_KEY (Claude).'))
      try {
        const fx = await import('../lib/fx.js')
        const target = fx.findMedia(m, ['imageMessage', 'stickerMessage'])
        if (!target) return reply(nexusHint('Send or reply to an image with the command.'))
        const buf = await fx.download(sock, target)
        const mime = target.message.imageMessage?.mimetype || target.message.stickerMessage?.mimetype || 'image/jpeg'
        const out = await askAI(STYLE, [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mime.split(';')[0], data: buf.toString('base64') } },
            { type: 'text', text: body || 'Describe this image clearly.' },
          ],
        }], 900)
        await reply(nexusBox('👁️ *VISION*', [out.slice(0, 3500)]))
      } catch (e) {
        await reply(nexusHint('❌ ' + e.message))
      }
    }
  },
  t('prompt', ['text2prompt'], 'Turn an idea into an image prompt', '🖼️', 'IMAGE PROMPT', 'prompt a cat astronaut on the moon',
    'Turn the idea into one detailed, vivid image generation prompt covering subject, style, lighting, camera and mood. Reply with the prompt only.', 400),

  // ───── Language & writing ─────
  tool({ name: 'translate', aliases: ['tr'], desc: 'Translate text, e.g. .translate french good morning',
    icon: '🌍', title: 'TRANSLATE', usage: 'translate french good morning  (or reply to a message)',
    system: 'Translate the text into the requested language. Reply with the translation only, then on a new line the detected source language in brackets.',
    input: (ctx) => {
      const [lang, ...rest] = ctx.body.split(/\s+/).filter(Boolean)
      const text = rest.join(' ') || quotedText(ctx.content)
      return lang && text ? `Translate into ${lang}:\n\n${text}` : null
    } }),
  tool({ name: 'summarize', aliases: ['sum', 'tldr'], desc: 'Summarize a text (type it or reply to it)',
    icon: '📝', title: 'SUMMARY', usage: 'summarize <text>  (or reply to a message)',
    system: 'Summarize the text in a few short bullet points using the • symbol.', max: 800 }),
  tool({ name: 'fix', aliases: ['grammar', 'correct'], desc: 'Fix spelling and grammar',
    icon: '✅', title: 'CORRECTED TEXT', usage: 'fix <text>  (or reply to a message)',
    system: 'Fix spelling, grammar and punctuation without changing the meaning. Reply with the corrected text only.' }),
  tool({ name: 'rewrite', aliases: ['paraphrase'], desc: 'Rewrite text, e.g. .rewrite formal <text>',
    icon: '✍️', title: 'REWRITTEN', usage: 'rewrite formal <text>  (tones: formal, casual, friendly, short, polite)',
    system: 'Rewrite the text in the requested tone while keeping the meaning. Reply with the rewritten text only.',
    input: (ctx) => {
      const tones = ['formal', 'casual', 'friendly', 'short', 'polite', 'professional']
      const words = ctx.body.split(/\s+/).filter(Boolean)
      const tone = tones.includes((words[0] || '').toLowerCase()) ? words.shift().toLowerCase() : 'clear and polished'
      const text = words.join(' ') || quotedText(ctx.content)
      return text ? `Tone: ${tone}\n\nText:\n${text}` : null
    } }),
  tool({ name: 'explain', aliases: ['whatis'], desc: 'Explain anything simply',
    icon: '💡', title: 'EXPLANATION', usage: 'explain how vaccines work',
    system: 'Explain the topic clearly for a beginner in a few short paragraphs.', max: 1100 }),
  tool({ name: 'eli5', desc: 'Explain like I am 5',
    icon: '🧒', title: 'SIMPLE EXPLANATION', usage: 'eli5 how does the internet work',
    system: 'Explain the topic like the reader is 5 years old, using a simple everyday example. Maximum 6 sentences.', max: 600 }),
  t('expand', ['elaborate'], 'Add more detail to a text', '➕', 'EXPANDED', 'expand <text>  (or reply to a message)',
    'Expand the text with more useful detail, keeping the same meaning and tone. Reply with the new text only.', 1000),
  t('concise', ['condense'], 'Make a text shorter', '✂️', 'SHORTER', 'concise <text>  (or reply to a message)',
    'Make the text much shorter while keeping the key meaning. Reply with the shorter text only.', 500),
  t('swahili', ['kiswahili'], 'Get an answer in Swahili', '🇰🇪', 'KISWAHILI', 'swahili explain how banks work',
    'Answer the question in clear, simple Swahili.', 900),
  tool({ name: 'sheng', desc: 'Translate English to Kenyan Sheng',
    icon: '🗣️', title: 'SHENG', usage: 'sheng how are you doing today',
    system: 'Translate the text into natural Kenyan Sheng. Reply with the Sheng text, then one line starting with "Meaning:" giving the plain English.', max: 400 }),
  t('synonyms', ['synonym', 'antonyms'], 'Synonyms and antonyms of a word', '📚', 'WORD HELP', 'synonyms happy',
    'List 8 synonyms and 4 antonyms of the word, each with a very short note if the meaning differs.', 400),
  t('acronym', ['abbr'], 'What an acronym stands for', '🔤', 'ACRONYM', 'acronym SACCO',
    'Say what the acronym stands for. If it has several common meanings, list the top 3.', 300),
  t('emojify', ['emojitext'], 'Rewrite text with emojis', '😀', 'EMOJIFIED', 'emojify I love pizza on Friday night',
    'Rewrite the text using emojis in place of words wherever they fit. Reply with the result only.', 300),
  t('replyto', ['smartreply'], 'Get 3 reply options for a message', '↩️', 'REPLY OPTIONS', 'replyto <message>  (or reply to a message)',
    'Write 3 possible replies to the message: one polite, one friendly, one short. Number them.', 500),

  // ───── Writing helpers ─────
  tool({ name: 'email', aliases: ['mail'], desc: 'Write an email from your idea',
    icon: '📧', title: 'EMAIL DRAFT', usage: 'email ask my landlord to fix the tap',
    system: 'Write a short, professional email with a subject line and a greeting and sign-off. Use [Your Name] where a name is needed.', max: 900 }),
  tool({ name: 'caption', desc: 'Social media captions for a topic',
    icon: '📸', title: 'CAPTIONS', usage: 'caption sunset at the beach',
    system: 'Write 5 short catchy social media captions with fitting emojis. Number them 1 to 5.', max: 700 }),
  tool({ name: 'hashtags', aliases: ['tags'], desc: 'Hashtag ideas for a topic',
    icon: '#️⃣', title: 'HASHTAGS', usage: 'hashtags football training',
    system: 'Give 15 relevant hashtags on one line, separated by spaces. No other text.', max: 300 }),
  tool({ name: 'bio', desc: 'Write a short social media bio',
    icon: '👤', title: 'BIO IDEAS', usage: 'bio photographer from Nairobi who loves travel',
    system: 'Write 4 different short bios (under 150 characters each) based on the details. Number them 1 to 4.', max: 500 }),
  tool({ name: 'names', aliases: ['namegen'], desc: 'Name ideas for a business, pet, channel...',
    icon: '🏷️', title: 'NAME IDEAS', usage: 'names a tech store in Mombasa',
    system: 'Suggest 10 creative, memorable names with a few words on why each fits. Number them.', max: 700 }),
  tool({ name: 'ideas', aliases: ['brainstorm'], desc: 'Brainstorm ideas on any topic',
    icon: '🧠', title: 'IDEAS', usage: 'ideas side businesses with a phone only',
    system: 'Give 8 practical, specific ideas. One line each, numbered.', max: 800 }),
  tool({ name: 'poem', desc: 'Write a short poem',
    icon: '🪶', title: 'POEM', usage: 'poem about the rainy season',
    system: 'Write an original poem of 8 to 12 lines on the topic.', max: 500 }),
  tool({ name: 'story', desc: 'Write a short story',
    icon: '📖', title: 'SHORT STORY', usage: 'story a boy who finds a talking bird',
    system: 'Write an original short story of about 250 words with a clear beginning, middle and end.', max: 900 }),
  t('writesong', ['songwriter'], 'Write original song lyrics', '🎤', 'SONG', 'writesong a love song about Nairobi nights',
    'Write original song lyrics (verse, chorus, verse). Never copy lyrics from an existing song.', 700),
  t('essay', [], 'Write a short essay', '📄', 'ESSAY', 'essay the importance of clean water',
    'Write a well structured essay of about 300 words with an introduction, body and conclusion.', 1100),
  t('outline', [], 'Make an outline for a topic', '🗂️', 'OUTLINE', 'outline a presentation on solar energy',
    'Create a clear outline with main headings and short sub points.', 700),
  t('letter', [], 'Write a formal letter', '✉️', 'LETTER', 'letter requesting a day off for a family event',
    'Write a formal letter with date, greeting, body and sign-off. Use [Your Name] and [Address] placeholders.', 800),
  t('coverletter', ['applyjob'], 'Write a short job cover letter', '💼', 'COVER LETTER', 'coverletter sales assistant, 2 years in retail',
    'Write a short, professional cover letter (about 150 words) using the details. Use [Your Name] placeholders.', 700),
  t('cv', ['resume'], 'CV summary and bullet points', '📑', 'CV HELP', 'cv graphic designer, 3 years, Photoshop and Illustrator',
    'Write a 2 line professional summary and 6 strong achievement-style CV bullet points based on the details.', 700),
  t('interview', [], 'Practice interview questions for a job', '🎙️', 'INTERVIEW PREP', 'interview customer service officer',
    'Give 8 likely interview questions for the role, each with a one line tip for answering well.', 900),
  t('speech', [], 'Write a short speech', '🎤', 'SPEECH', 'speech welcoming guests at my sister\'s graduation',
    'Write a warm short speech of about 150 words for the occasion.', 600),
  t('birthday', ['bday'], 'Birthday wishes', '🎂', 'BIRTHDAY WISHES', 'birthday my mum turning 50',
    'Write 3 different birthday wishes: one warm, one short, one funny. Number them.', 500),
  t('lovemsg', ['love'], 'Sweet love messages', '💌', 'LOVE MESSAGES', 'lovemsg for my wife, 5 year anniversary',
    'Write 3 sweet, respectful love messages of different lengths. Number them.', 500),
  t('apology', ['sorry'], 'Write a sincere apology', '🙏', 'APOLOGY', 'apology I forgot our meeting yesterday',
    'Write a short, sincere apology message that takes responsibility and offers to make it right.', 400),
  t('thanks', ['thankyou'], 'Write thank-you messages', '🤗', 'THANK YOU', 'thanks my teacher for helping me pass',
    'Write 3 thank-you messages of different lengths. Number them.', 400),
  tool({ name: 'roast', desc: 'A light, friendly roast',
    icon: '🔥', title: 'ROAST', usage: 'roast my friend who is always late',
    system: 'Write a light, friendly, playful roast of 4 lines. Never mock appearance, disability, religion, tribe, gender or anyone\'s tragedies. Funny and kind.', max: 300 }),
  t('dailyplan', ['schedule', 'todo'], 'Turn tasks into a schedule', '🗓️', 'TODAY\'S PLAN', 'dailyplan gym, pay rent, finish report, call mum',
    'Turn the tasks into a realistic prioritized schedule for today with time blocks.', 600),
  t('decide', ['decision'], 'Help choosing between options', '⚖️', 'DECISION', 'decide laptop A 60k vs laptop B 45k for programming',
    'List the key criteria, score each option out of 10 per criterion, then pick one and say why in two lines.', 700),
  t('replywork', ['workmsg'], 'Polish a work message', '🏢', 'WORK MESSAGE', 'replywork tell my boss the report will be one day late',
    'Write a clear, polite, professional work message for the situation. Reply with the message only.', 400),

  // ───── Social media & business ─────
  t('post', ['social'], 'Ready-to-post social media post', '📱', 'POST', 'post new phone repair shop opening in Kisumu',
    'Write a ready-to-post social media post with fitting emojis and 5 hashtags at the end.', 500),
  t('slogan', [], 'Catchy slogans', '📣', 'SLOGANS', 'slogan a fresh juice business',
    'Write 8 short, catchy slogans. Number them.', 400),
  t('productdesc', ['describeproduct'], 'Product description that sells', '🛍️', 'PRODUCT DESCRIPTION', 'productdesc wireless earbuds with 30 hour battery',
    'Write a persuasive product description of about 80 words, then 3 bullet benefits using the • symbol.', 500),
  t('adcopy', ['adtext'], 'Short advertising text', '📢', 'AD COPY', 'adcopy web design services for small shops',
    'Write 3 short advertising texts for WhatsApp status or Facebook, each with a clear call to action. Number them.', 600),
  t('videoscript', ['reelscript'], 'Short video script', '🎥', 'VIDEO SCRIPT', 'videoscript how to save money as a student',
    'Write a short video script under 150 words: a hook line, 3 short scenes, and a call to action.', 600),
  t('titles', ['headline'], 'Catchy titles or headlines', '🔖', 'TITLES', 'titles article about budget travel in East Africa',
    'Write 10 catchy titles or headlines. Number them.', 400),
  t('videoideas', ['vidideas'], 'Video ideas for a channel', '🎬', 'VIDEO IDEAS', 'videoideas tech tips channel for beginners',
    'Give 10 video ideas, each with a strong title hook. Number them.', 700),
  t('keywords', ['seo'], 'Keywords for a topic or business', '🔎', 'KEYWORDS', 'keywords wedding photographer in Nairobi',
    'Give 15 relevant search keywords, grouped as short and long phrases.', 500),
  t('faq', [], 'FAQs for a business or product', '❓', 'FAQ', 'faq a laptop repair shop',
    'Write 5 frequently asked questions with short helpful answers for the business or product.', 900),
  t('bizplan', ['business'], 'Simple business plan outline', '📈', 'BUSINESS PLAN', 'bizplan mobile phone accessories shop',
    'Give a simple one page plan: idea, target customers, startup costs (rough), how to get the first 10 customers, and main risks. Short bullets.', 1000),
  t('swot', [], 'SWOT analysis', '🧭', 'SWOT', 'swot a small online clothing store',
    'Give a SWOT analysis with 3 short bullets under each of Strengths, Weaknesses, Opportunities, Threats.', 700),
  t('budgetplan', ['savings'], 'Simple monthly budget plan', '💰', 'BUDGET PLAN', 'budgetplan income 30000, rent 8000, student',
    'Create a simple monthly budget from the details, with amounts per category and a savings target. This is general information, not financial advice.', 700),

  // ───── Learning & life ─────
  tool({ name: 'code', aliases: ['dev'], desc: 'Write code, e.g. .code python function to reverse a string',
    icon: '💻', title: 'CODE', usage: 'code javascript function to reverse a string',
    system: 'Write working code for the request. You may put the code inside triple backticks. After the code, add one or two lines explaining how to use it.', max: 1500 }),
  t('debug', ['fixcode'], 'Find and fix a bug in code', '🐞', 'DEBUG', 'debug <code or error>  (or reply to a message)',
    'Find the bug or explain the error in simple words, then give the fixed code in triple backticks.', 1500),
  t('explaincode', ['codeexplain'], 'Explain what code does', '🧩', 'CODE EXPLAINED', 'explaincode <code>  (or reply to a message)',
    'Explain what the code does step by step in simple words.', 1200),
  t('sql', [], 'Write an SQL query', '🗄️', 'SQL', 'sql get the 10 newest users from the users table',
    'Write the SQL query for the request inside triple backticks, then one line explaining it.', 600),
  t('regex', [], 'Write a regex pattern', '🔣', 'REGEX', 'regex match a Kenyan phone number',
    'Give the regular expression inside backticks, then a short explanation and two examples that match.', 500),
  t('excel', ['formula'], 'Excel or Sheets formula', '📊', 'FORMULA', 'excel sum column B where column A says paid',
    'Give the exact Excel/Google Sheets formula, then a one line explanation.', 400),
  t('terminal', ['shell'], 'Linux terminal command for a task', '⌨️', 'COMMAND', 'terminal find files bigger than 100MB',
    'Give the Linux terminal command and a short explanation. Warn clearly if the command can delete data.', 500),
  tool({ name: 'math', aliases: ['solve'], desc: 'Solve a math problem step by step',
    icon: '🧮', title: 'MATH SOLUTION', usage: 'math 15% of 2400 plus 300',
    system: 'Solve the problem step by step, showing each step briefly, then give the final answer on its own line starting with "Answer:".', max: 900 }),
  tool({ name: 'quiz', desc: 'Make a 5 question quiz on a topic',
    icon: '🎯', title: 'QUIZ', usage: 'quiz photosynthesis',
    system: 'Write 5 multiple choice questions (A to D) on the topic. After all questions, add an "Answers:" line listing the correct letters.', max: 1000 }),
  t('flashcards', ['cards'], 'Study flashcards on a topic', '🃏', 'FLASHCARDS', 'flashcards the human heart',
    'Make 8 flashcards in the format "Q: ..." then "A: ...".', 900),
  t('mnemonic', ['remember'], 'Memory tricks for a list', '🧷', 'MEMORY TRICKS', 'mnemonic the planets in order',
    'Create 3 memorable mnemonics or memory tricks for the topic.', 400),
  t('studyplan', ['study'], '7 day study plan', '📚', 'STUDY PLAN', 'studyplan KCSE chemistry, 2 hours a day',
    'Create a 7 day study plan with specific daily tasks that fit the time available. Keep each day to 2 lines.', 900),
  t('howto', ['steps', 'guide'], 'Step by step guide', '🪜', 'HOW TO', 'howto change a flat tyre',
    'Give clear numbered steps, at most 10, with a short safety note if needed.', 800),
  t('facts', ['funfacts'], 'Interesting facts about a topic', '🧐', 'FACTS', 'facts octopuses',
    'Give 6 interesting facts. Leave out any detail you are not sure about.', 600),
  t('compare', ['vs'], 'Compare two things', '🆚', 'COMPARE', 'compare Android vs iPhone for a student',
    'Compare the two things in short bullet points covering the main differences, then say which fits which kind of person. No tables.', 800),
  t('proscons', ['pc'], 'Pros and cons', '➕', 'PROS AND CONS', 'proscons buying a motorbike',
    'Give two short bullet lists, Pros then Cons, then a one line verdict.', 600),
  tool({ name: 'recipe', aliases: ['cook'], desc: 'Get a recipe for a dish or ingredients',
    icon: '🍳', title: 'RECIPE', usage: 'recipe pilau  (or: recipe rice, eggs, tomatoes)',
    system: 'Give a simple recipe: ingredients list, then short numbered steps. If the user lists ingredients, suggest one dish that uses them.', max: 1000 }),
  t('mealplan', ['meals'], '3 day meal plan', '🥗', 'MEAL PLAN', 'mealplan cheap healthy meals, family of 4',
    'Create a simple 3 day meal plan with affordable everyday foods (East African friendly unless the user says otherwise). One line per meal.', 800),
  t('workout', ['gym'], 'Beginner workout plan', '🏋️', 'WORKOUT PLAN', 'workout lose belly fat, no equipment, 5 days',
    'Create a simple 5 day beginner workout plan that fits the goal and equipment. Short lines. Add one line that this is general fitness information and anyone with pain or a health condition should check with a doctor first.', 800),
  tool({ name: 'advice', desc: 'Practical advice for a situation',
    icon: '🤝', title: 'ADVICE', usage: 'advice I have two job offers and cannot choose',
    system: 'Give calm, practical, balanced advice in a few short points. If the situation involves health, legal or money risks, remind the user to talk to a qualified professional.', max: 800 }),
  tool({ name: 'motivate', aliases: ['quote'], desc: 'A motivational message',
    icon: '🔥', title: 'MOTIVATION', usage: 'motivate I am tired of studying',
    system: 'Write a short, warm, encouraging message in 3 to 4 sentences. Do not use cliches.', max: 400,
    input: (ctx) => textOf(ctx) || 'Give me a short motivational message for today.' })
]
