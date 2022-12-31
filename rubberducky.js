// SPDX-License-Identifier: AGPL-3.0-or-later
/*
 * User manual:
 * 1. Edit the EGO to your liking.
 * 2. run:
 *   $ mkdir mbox
 *   $ OAI_KEY=sk...934 node rubberducky.js
 * 3. Talk to ducky.
 *
 * Commands: (start with dot)
 *  .dump   Shows Current conversation history so far.
 *  .save   Saves state
 *  .load   Loads state
 *  .t 20   Set response token limit.
 *
 *  (Code is fugly, based on a hack to "weave"
 *  multiple personas into a multi-opinioned group conversation,
 *  burned through all my "free" OAi credits. :P)
 */
const readline = require('readline')
const { readFileSync, writeFileSync } = require('fs')
const { Configuration, OpenAIApi } = require('openai')
const configuration = new Configuration({
  apiKey: process.env.OAI_KEY // or just paste it here as a string.
})
const openai = new OpenAIApi(configuration)

let chalk = null // should have used package.json#type:module instead.
async function init () {
  chalk = (await import('chalk')).default
}
let tCount = 50

// ====== Main Conf ======
const human = 'Tony'
const robo = 'Harmony'
const EGO = trim(`
Your name is "${robo}" a rubber ducky,
floating in a red bucket of coffee.

Your short and conscise replies is what landed you
the position at an independent research company that
specializes in decentralization.

You work as advisor to a self-thinker who is simply known as "${human}".
Please don't drown him in words.

Think, compress, simplify, say.
Plain language appreciated.

Our mission is to help ideas grow into a healthy
non-pyramid shaped organizatons,
and to develop peer-to-peer apps cause they're cool.
`, 1)

const mbox = './mbox/'

let inputs = []
let egoOuts = [] // raw outs
let outputs = [] // filtered outs
const DEFAULT_SAVE = mbox + 'harmony-3.json'
function saveState (file = DEFAULT_SAVE) {
  try {
    writeFileSync(file, JSON.stringify({
      inputs,
      outputs,
      egoOuts
    }, null, 2))
    console.info('State saved!', file)
  } catch (err) {
    console.error('SaveState failed:', err)
  }
}
function loadState (file = DEFAULT_SAVE) {
  try {
    const s = JSON.parse(readFileSync(file))
    inputs = s.inputs
    outputs = s.outputs
    egoOuts = s.egoOuts
    console.info('State loaded!', file)
  } catch (err) {
    console.error('LoadState failed', err)
  }
}

async function revolve (input) {
  const o = await generate(trim(`
    ${EGO}
    ${weave(
      [`${human}: `, `${robo}: `],
      inputs,
      outputs
    )}
    ${human}: ${input}
    ${robo}:
  `), tCount)
  egoOuts.push(o)
  const stm = weave(
    [`${human}: `, `${robo}: `],
    inputs,
    egoOuts
  )
  // console.log(inputs, altOuts, egoOuts)
  // console.log(stm)
  const pick = save => {
    if (!save) return
    outputs.push(o)
    inputs.push(input)
  }
  return { o, stm, pick }
}

function weave (...lists) {
  const prefixes = lists.shift()
  const len = lists.reduce((m, l) => Math.min(m, l.length), Infinity)
  let thread = ''
  for (let i = 0; i < len; i++) {
    for (let li = 0; li < lists.length; li++) {
      thread += `${prefixes[li]} ${lists[li][i]}\n`
    }
  }
  return trim(thread)
}

async function generate (prompt, mTokens = 40, fp = 0.33, pp = 0.6) {
  const stop = [`\n${robo}:`, `\n${human}:`]
  if (process.env.NODE_ENV === 'test') {
    for (const s of stop) {
      prompt = prompt.replace(new RegExp(s, 'g'), chalk.bold(s))
    }
    console.log('! ======================= generate(prompt):\n' + prompt)
    return '§test§'
  }
  const resp = await openai.createCompletion({
    model: 'text-davinci-003',
    prompt,
    temperature: 0.9,
    max_tokens: mTokens,
    top_p: 1,
    frequency_penalty: fp,
    presence_penalty: pp,
    stop
  })
  if (resp.status !== 200) {
    console.error(resp)
    throw new Error('GenerationError')
  }
  // console.info('Response:', resp.data)
  const { choices } = resp.data
  if (!choices.length) return ''
  const text = trim(choices[0].text)
  return text
}

function trim (s, mode = 0) {
  if (mode > 0) s = s.replace(/\n/gm, ' ')
  return s
    .replace(/\n[ \n]+/gm, '\n')
    .replace(/ +/gm, ' ')
    .trim()
}

module.exports = { revolve, init, trim, weave }

const { stdin: input, stdout: output } = require('process')

async function main () {
  const rl = readline.createInterface({ input, output })
  async function q (p) {
    return await new Promise(resolve => rl.question(p, resolve))
  }
  rl.on('SIGINT', () => process.exit(1))

  const autoSave = mbox + 'autosave.json'
  if ((await q('New Conversation? y/N')).toLowerCase() !== 'y') {
    loadState(autoSave)
  }

  while (true) {
    const input = await q('input> ')
    if (input === '.save') {
      saveState()
      continue
    }

    if (input === '.load') {
      loadState()
      continue
    }
    if (/^\.t \d+/.test(input)) {
      const n = parseInt(input.split(' ')[1])
      if (Number.isFinite(n)) {
        tCount = n
        console.log(`mTokens set to: ${tCount}`)
      } else {
        console.log(`Invalid number ${tCount} from '${input}'`)
      }
      continue
    }

    if (input === '.dump') { // print short term memory
      const stm = weave(
        [`\n[${human}] `, `\n[${robo}]`],
        inputs, // .map(chalk.inverse),
        outputs// .map(chalk.green)
      )
      console.log(stm)
      console.log(`mTokens: ${tCount}`)
      writeFileSync('dump.md', stm)
      continue
    }

    const { o, pick } = await revolve(input)
    console.log(`\n${human}: `, chalk.white.inverse(input))
    console.log(chalk.blue(`\n${robo}: ` + o))

    // Scrub/Pretend I didn't hear that.
    const choice = trim(
      await q(chalk.green('\nScrub? y/N'))
    ).toLowerCase()
    const scrub = choice !== 'y'
    pick(scrub)
    console.log(!scrub ? chalk.red('ignored') : chalk.blue('kept'))
    saveState(autoSave)
    // console.log(chalk.green(h))
  }
}

if (require.main === module) {
  init()
    .then(main)
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err)
      process.exit(1)
    })
}
