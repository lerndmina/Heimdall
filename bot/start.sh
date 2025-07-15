#!/bin/bash
FILE="src/Bot.ts"
REMOVE="dist/"
LOGFILE="bot.log"

# Check if bun is installed
if ! command -v bun &>/dev/null; then
    echo "Bun is not installed, please install it first."
    exit 1
fi

while true; do
    if [ -f $FILE ]; then
        echo "$FILE found, starting Bot..."
        echo "Bot started @ $(date)" >>restart.log
        if [ -d $REMOVE ]; then
            echo "Removing old dist/ folder..."
            rm -rf $REMOVE
        fi
        git pull && bun i -y && echo "Booting bot" && bun run start
        echo "Bot detected in a crashed or stopped state, beginning restart process..."
        echo "Bot stoped or crashed @ $(date)" >>restart.log
        echo "Restarting in 3 seconds"
        sleep 1
        echo "Restarting in 2 seconds"
        sleep 1
        echo "Restarting in 1 seconds"
        sleep 1
        echo "Restarting now"
        sleep 1
    else
        echo "$FILE not found, waiting for it..."
        sleep 5
    fi
done
