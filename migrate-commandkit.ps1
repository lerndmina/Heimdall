# PowerShell script to migrate all CommandKit imports to @heimdall/command-handler
# This script updates TypeScript files in the bot/src directory

$basePath = "c:\Users\Wild\Documents\GitHub\Heimdall\bot\src"

# Define the replacement mappings
$replacements = @{
    'from "commandkit"' = 'from "@heimdall/command-handler"'
    'CommandOptions' = 'LegacyCommandOptions'
    'SlashCommandProps' = 'LegacySlashCommandProps'
    'AutocompleteProps' = 'LegacyAutocompleteProps'
    'CommandData' = 'LegacyCommandData'
    'ContextMenuCommandProps' = 'LegacyContextMenuCommandProps'
    'MessageContextMenuCommandProps' = 'LegacyContextMenuCommandProps'
}

# Get all TypeScript files recursively
$files = Get-ChildItem -Path $basePath -Filter "*.ts" -Recurse

Write-Host "Found $($files.Count) TypeScript files to process..."

$processedFiles = 0
$modifiedFiles = 0

foreach ($file in $files) {
    $processedFiles++
    Write-Progress -Activity "Migrating CommandKit imports" -Status "Processing $($file.Name)" -PercentComplete (($processedFiles / $files.Count) * 100)
    
    # Skip if file doesn't contain commandkit import
    $content = Get-Content $file.FullName -Raw
    if (-not $content.Contains('commandkit')) {
        continue
    }
    
    $originalContent = $content
    $modified = $false
    
    # Apply replacements
    foreach ($old in $replacements.Keys) {
        $new = $replacements[$old]
        if ($content.Contains($old)) {
            $content = $content.Replace($old, $new)
            $modified = $true
        }
    }
    
    # Only write if content was modified
    if ($modified -and $content -ne $originalContent) {
        Set-Content -Path $file.FullName -Value $content -NoNewline
        $modifiedFiles++
        Write-Host "Modified: $($file.FullName)" -ForegroundColor Green
    }
}

Write-Host "`nMigration complete!" -ForegroundColor Cyan
Write-Host "Processed: $processedFiles files" -ForegroundColor Yellow
Write-Host "Modified: $modifiedFiles files" -ForegroundColor Green

Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "1. Run 'bun run build' to check for any remaining errors"
Write-Host "2. Test the application to ensure everything works correctly"
Write-Host "3. Commit the changes when ready"
