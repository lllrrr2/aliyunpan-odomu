import dayjs from 'dayjs'
import { execSync } from 'node:child_process'
import fs from 'node:fs'

process.env.TZ = 'Asia/Shanghai'
const packageJsonStr = fs.readFileSync('./package.json').toString()
try {
  const tmp = `3.${dayjs().format('YY.MMDDHH')}`
  const packageJson = JSON.parse(packageJsonStr)
  if (packageJson.version < tmp) {
    packageJson.version = tmp
    console.info('版本升级为' + packageJson.version)
    fs.writeFileSync('./package.json', JSON.stringify(packageJson, null, 2))
    execSync(`git add package.json`)
  }
} catch (e) {
  console.error('处理package.json失败，请重试', e.message)
  process.exit(1)
}

