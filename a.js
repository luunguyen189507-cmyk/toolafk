import mineflayer from 'mineflayer'
import fs from 'fs'
import chalk from 'chalk'
import moment from 'moment'
import readline from 'readline'

/* ================= READLINE ================= */

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

/* ================= CONFIG ================= */

const config = JSON.parse(
  fs.readFileSync('./afk.json', 'utf8')
)

let flowFinished = false
let flowRunning = false
let isReconnecting = false
let manualReconnect = false

/* ================= MOVE / SWING ================= */

let moveInterval = null
let swingInterval = null

/* ================= TIME ================= */

function time() {
  return config.ui?.showTime
    ? chalk.gray(`[${moment().format('HH:mm:ss')}]`)
    : ''
}

/* ================= CREATE BOT ================= */

let bot = null

function createBot() {
  if (bot) {
    try {
      bot.end()
    } catch(e) {}
  }

  bot = mineflayer.createBot({
    host: config.server.host,
    port: config.server.port,
    username: config.account.username,
    auth: config.account.auth,
    version: config.server.version,
    hideErrors: true,
    reconnectDelay: 5000
  })

  setupBotEvents()
}

/* ================= WAIT ================= */

function wait(ms) {
  return new Promise(r => setTimeout(r, ms))
}

/* ================= CLICK SLOT ================= */

async function safeClickSlot(slot) {

  if (!bot.currentWindow)
    return false

  const window = bot.currentWindow

  if (slot < 0 || slot >= window.slots.length)
    return false

  try {

    await wait(1000)

    bot.simpleClick.leftMouse(slot)

    return true

  } catch {

    return false
  }
}

/* ================= MOVE ================= */

function startMove() {

  if (moveInterval) return

  moveInterval = setInterval(() => {

    if (!bot || !bot.entity) return

    bot.setControlState('forward', true)

    setTimeout(() => {
      if (bot && bot.entity) {
        bot.setControlState('forward', false)
      }
    }, 1000)

  }, 10000)

  console.log(
    time(),
    chalk.green("✔ Move ON")
  )
}

function stopMove() {

  clearInterval(moveInterval)

  moveInterval = null

  if (bot && bot.entity) {
    bot.setControlState('forward', false)
  }

  console.log(
    time(),
    chalk.red("✖ Move OFF")
  )
}

/* ================= SWING ================= */

function startSwing() {

  if (swingInterval) return

  swingInterval = setInterval(() => {

    try {
      if (bot && bot.swingArm) {
        bot.swingArm('right')
      }
    } catch {}

  }, 3000)

  console.log(
    time(),
    chalk.green("✔ Swing ON")
  )
}

function stopSwing() {

  clearInterval(swingInterval)

  swingInterval = null

  console.log(
    time(),
    chalk.red("✖ Swing OFF")
  )
}

/* ================= RESET FLOW STATE ================= */

function resetFlowState() {
  flowFinished = false
  flowRunning = false
}

/* ================= AUTO FLOW ================= */

async function autoJoinFlow() {

  // Nếu đã hoàn thành rồi thì không chạy nữa
  if (flowFinished) {
    console.log(
      time(),
      chalk.gray("→ Flow đã hoàn thành trước đó, bỏ qua...")
    )
    return
  }

  if (flowRunning) return
  if (!bot || !bot.entity) return

  flowRunning = true

  try {

    console.log(
      time(),
      chalk.cyan("➜ Bắt đầu auto flow...")
    )

    bot.chat("/dn minh123")

    console.log(
      time(),
      chalk.green("✔ Đã đăng nhập")
    )

    await wait(10000)

    if (!bot || !bot.entity) throw new Error("Bot disconnected")

    bot.chat("/menu")

    let tries = 0

    while (!bot.currentWindow && tries < 15) {

      await wait(1000)
      tries++
    }

    if (!bot.currentWindow) throw new Error("Không mở được menu")

    /* ===== LOOP KÍNH ===== */

    const checkedSlots = new Set()

    while (true) {

      await wait(3000)

      if (!bot || !bot.currentWindow) throw new Error("Window closed")

      const window = bot.currentWindow

      let foundSlot = -1

      for (let i = 0; i < window.slots.length; i++) {

        const item = window.slots[i]

        if (!item) continue

        const name =
          (
            (item.displayName || "") +
            " " +
            (item.name || "")
          ).toLowerCase()

        if (
          (
            name.includes("lime") ||
            name.includes("green")
          ) &&
          (
            name.includes("glass") ||
            name.includes("pane")
          ) &&
          !checkedSlots.has(i)
        ) {

          foundSlot = i

          break
        }
      }

      // hết kính
      if (foundSlot === -1) {

        console.log(
          time(),
          chalk.cyan("➜ Đang vào kingsmp...")
        )

        await safeClickSlot(24)

        break
      }

      checkedSlots.add(foundSlot)

      console.log(
        time(),
        chalk.yellow("➜ Đang bypass captcha...")
      )

      await safeClickSlot(foundSlot)

      await wait(8000)
    }

    /* ===== WARP AFK ===== */

    await wait(10000)

    console.log(
      time(),
      chalk.magenta("➜ Đang dịch chuyển đến khu afk...")
    )

    if (!bot || !bot.entity) throw new Error("Bot disconnected")

    bot.chat("/warp afk")

    // Đánh dấu đã hoàn thành, không chạy lại nữa
    flowFinished = true

    console.log(
      time(),
      chalk.green("✔ Hoàn thành auto flow! Đang AFK...")
    )

    // Bật move và swing sau khi hoàn thành flow
    startMove()
    startSwing()

  } catch (err) {

    console.log(
      time(),
      chalk.red("✖ Lỗi trong auto flow:"),
      err.message
    )

    // Chỉ reset khi có lỗi để thử lại
    flowFinished = false

  } finally {

    flowRunning = false
  }
}

/* ================= RECONNECT ================= */

async function reconnect() {
  if (isReconnecting) return

  isReconnecting = true

  console.log(
    time(),
    chalk.yellow("🔄 Bị disconnect, sẽ reconnect sau 5s...")
  )

  // Reset state để khi reconnect xong sẽ chạy lại flow
  resetFlowState()
  
  // Tắt move/swing nếu đang bật
  stopMove()
  stopSwing()

  // Delay cố định 5 giây
  await wait(5000)

  if (!manualReconnect) {
    createBot()
  }

  isReconnecting = false
}

/* ================= SETUP BOT EVENTS ================= */

function setupBotEvents() {

  bot.on('login', () => {

    console.log(
      time(),
      chalk.green('✔ Logged in')
    )
  })

  bot.on('spawn', async () => {

    console.log(
      time(),
      chalk.cyan('✔ Spawned')
    )

    // Đợi 10 giây cho server ổn định
    await wait(10000)

    // Chỉ chạy flow nếu chưa hoàn thành
    if (!flowFinished && !flowRunning && bot && bot.entity) {
      autoJoinFlow()
    } else if (flowFinished) {
      console.log(
        time(),
        chalk.gray("→ AFK flow đã hoàn thành, tiếp tục AFK...")
      )
      // Đảm bảo move/swing đang bật
      startMove()
      startSwing()
    }
  })

  /* ================= CHAT LOG ================= */

  bot.on('message', (msg) => {

    if (!bot) return

    const text =
      msg.toString().replace(/§./g, '')

    // chỉ ẩn log auto flow
    if (
      text.includes("/dn minh123") ||
      text.includes("/menu") ||
      text.includes("/warp afk")
    ) return

    console.log(
      time(),
      chalk.white(text)
    )
  })

  bot.on("kicked", (reason) => {

    console.log(
      time(),
      chalk.red("✖ Bị kick:"),
      reason?.toString() || "Unknown reason"
    )

    if (!manualReconnect) {
      reconnect()
    }
  })

  bot.on("error", (err) => {
    // Bỏ qua lỗi ECONNRESET thông thường
    if (err.code !== 'ECONNRESET') {
      console.log(
        time(),
        chalk.red("✖ Lỗi:"),
        err.message
      )
    }
  })

  bot.on('end', () => {

    console.log(
      time(),
      chalk.red('✖ Disconnected')
    )

    if (!manualReconnect) {
      reconnect()
    }
  })
}

/* ================= CLI ================= */

rl.on("line", async (line) => {

  if (!line.trim()) return

  /* ===== !reconnect ===== */

  if (line === "!reconnect") {
    console.log(
      time(),
      chalk.yellow("🔄 Đang reconnect thủ công...")
    )
    manualReconnect = true
    resetFlowState()
    stopMove()
    stopSwing()
    if (bot) {
      bot.end()
    }
    await wait(1000)
    manualReconnect = false
    createBot()
    return
  }

  /* ===== !restart ===== */

  if (line === "!restart") {
    console.log(
      time(),
      chalk.yellow("🔄 Đang restart bot...")
    )
    resetFlowState()
    stopMove()
    stopSwing()
    if (bot) {
      bot.end()
    }
    await wait(1000)
    createBot()
    return
  }

  /* ===== !status ===== */

  if (line === "!status") {
    console.log(
      chalk.yellow("=== BOT STATUS ===")
    )
    console.log(`Bot connected: ${bot && bot.entity ? "✅" : "❌"}`)
    console.log(`Flow finished: ${flowFinished ? "✅" : "❌"}`)
    console.log(`Flow running: ${flowRunning ? "✅" : "❌"}`)
    console.log(`Move: ${moveInterval ? "✅" : "❌"}`)
    console.log(`Swing: ${swingInterval ? "✅" : "❌"}`)
    return
  }

  /* ===== !slots ===== */

  if (line === "!slots") {

    if (!bot || !bot.currentWindow) {

      console.log(
        "❌ Không có GUI đang mở"
      )

      return
    }

    console.log(
      "📦 Tổng slot:",
      bot.currentWindow.slots.length
    )

    bot.currentWindow.slots.forEach((item, i) => {

      console.log(
        i,
        "-",
        item ? item.displayName : "Empty"
      )
    })

    return
  }

  /* ===== !slot ===== */

  if (line.startsWith("!slot")) {

    const args = line.split(" ")

    const slot = parseInt(args[1])

    if (isNaN(slot)) {

      console.log(
        "❌ Slot không hợp lệ"
      )

      return
    }

    await safeClickSlot(slot)

    return
  }

  /* ===== !move ===== */

  if (line === "!move on") {
    startMove()
    return
  }

  if (line === "!move off") {
    stopMove()
    return
  }

  /* ===== !swing ===== */

  if (line === "!swing on") {
    startSwing()
    return
  }

  if (line === "!swing off") {
    stopSwing()
    return
  }

  /* ===== CHAT ===== */

  if (bot && bot.chat) {
    bot.chat(line)
  }
})

/* ================= PROCESS ================= */

process.on(
  "unhandledRejection",
  (err) => {
    if (err?.code !== 'ECONNRESET') {
      console.log(chalk.red("Unhandled Rejection:"), err)
    }
  }
)

process.on(
  "uncaughtException",
  (err) => {
    if (err?.code !== 'ECONNRESET') {
      console.log(chalk.red("Uncaught Exception:"), err)
    }
  }
)

/* ================= START ================= */

createBot()
console.log(chalk.green("Bot started!"))
console.log(chalk.gray("Commands: !move on/off, !swing on/off, !slots, !slot <num>, !status, !reconnect, !restart"))
