#!/usr/bin/env pwsh
# Rollback Script for Site-Based Migration
# Usage: ./rollback.ps1 -CommitHash <hash> or ./rollback.ps1 -Mode quick
# Date: March 18, 2026

param(
    [string]$CommitHash,
    [ValidateSet("quick", "full", "interactive")]
    [string]$Mode = "interactive"
)

Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     Site-Based Migration Rollback Utility                      ║" -ForegroundColor Cyan
Write-Host "║     Version: 1.0 | March 18, 2026                             ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Verify we're in git repo
$gitDir = git rev-parse --git-dir 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error: Not in a git repository" -ForegroundColor Red
    exit 1
}

# Verify we're in SAS workspace
if (-not (Test-Path ".\SAS")) {
    Write-Host "❌ Error: SAS directory not found. Run from workspace root." -ForegroundColor Red
    exit 1
}

Write-Host "✅ Git repository verified" -ForegroundColor Green
Write-Host ""

# List of critical files modified in migration
$criticalFiles = @(
    "SAS/app/(tabs)/_layout.tsx",
    "SAS/app/(tabs)/ddo-ao.tsx",
    "SAS/app/(tabs)/attendance_change_request.tsx",
    "SAS/app/(tabs)/ot_request.tsx",
    "SAS/app/(tabs)/request.tsx",
    "SAS/services/siteService.ts",
    "SAS/services/storageService.ts"
)

$newFiles = @(
    "SAS/services/siteService.ts",
    "SAS/services/storageService.ts"
)

function Show-Status {
    Write-Host "📋 Modified Files:" -ForegroundColor Blue
    foreach ($file in $criticalFiles) {
        $status = (git status --short $file) -split '\s+' | Select-Object -First 1
        if ($status -eq "M") {
            Write-Host "  🔄 $file (modified)" -ForegroundColor Yellow
        } elseif ($status -eq "??") {
            Write-Host "  ➕ $file (new)" -ForegroundColor Cyan
        } else {
            Write-Host "  ✅ $file" -ForegroundColor Green
        }
    }
    Write-Host ""
}

function Show-Commits {
    Write-Host "📜 Recent Commits:" -ForegroundColor Blue
    git log --oneline -15 | ForEach-Object {
        Write-Host "  $_"
    }
    Write-Host ""
}

function Rollback-Quick {
    Write-Host "⚡ Quick Rollback Mode" -ForegroundColor Yellow
    Write-Host "This will revert the 7 critical files from the previous commit." -ForegroundColor Gray
    Write-Host ""
    
    $confirm = Read-Host "Proceed with rollback? (yes/no)"
    if ($confirm -ne "yes") {
        Write-Host "❌ Rollback cancelled" -ForegroundColor Red
        return
    }
    
    Write-Host "Starting rollback..." -ForegroundColor Cyan
    foreach ($file in $criticalFiles) {
        try {
            git checkout HEAD~1 -- $file 2>&1 | Out-Null
            Write-Host "  ✅ Reverted: $file" -ForegroundColor Green
        } catch {
            Write-Host "  ❌ Failed: $file - $_" -ForegroundColor Red
        }
    }
    
    Write-Host ""
    Write-Host "Clearing new service files..." -ForegroundColor Cyan
    foreach ($file in $newFiles) {
        if (Test-Path $file) {
            Remove-Item $file -Force
            Write-Host "  ✅ Deleted: $file" -ForegroundColor Green
        }
    }
    
    Write-Host ""
    Write-Host "✅ Rollback complete!" -ForegroundColor Green
    Write-Host "⚠️  You may need to:" -ForegroundColor Yellow
    Write-Host "   1. Clear app cache: npm cache clean --force" -ForegroundColor Gray
    Write-Host "   2. Reinstall dependencies: npm install" -ForegroundColor Gray
    Write-Host "   3. Restart development server" -ForegroundColor Gray
}

function Rollback-Full {
    Write-Host "🔄 Full Rollback Mode" -ForegroundColor Yellow
    Write-Host "This will revert the entire migration using git reset." -ForegroundColor Gray
    Write-Host ""
    
    if (-not $CommitHash) {
        Write-Host "❌ Commit hash required for full rollback. Use: ./rollback.ps1 -CommitHash <hash> -Mode full" -ForegroundColor Red
        return
    }
    
    Write-Host "Target commit hash: $CommitHash" -ForegroundColor Cyan
    
    # Verify commit exists
    $commitExists = git cat-file -t $CommitHash 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Commit not found: $CommitHash" -ForegroundColor Red
        return
    }
    
    Write-Host "⚠️  WARNING: This will reset your repository to $CommitHash" -ForegroundColor Red
    Write-Host "    All commits after that will be lost!" -ForegroundColor Red
    Write-Host ""
    
    $confirm = Read-Host "Are you absolutely sure? (yes/I understand)"
    if ($confirm -ne "yes" -and $confirm -ne "I understand") {
        Write-Host "❌ Full rollback cancelled" -ForegroundColor Red
        return
    }
    
    git reset --hard $CommitHash
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ Full rollback complete! Repository reset to $CommitHash" -ForegroundColor Green
        Write-Host "⚠️  Run: npm install && npm start" -ForegroundColor Yellow
    } else {
        Write-Host "❌ Rollback failed!" -ForegroundColor Red
    }
}

function Rollback-Interactive {
    Show-Status
    Show-Commits
    
    Write-Host "🔧 Choose rollback strategy:" -ForegroundColor Blue
    Write-Host "  1. Quick - Revert 7 files from HEAD~1 (recommended)" -ForegroundColor Cyan
    Write-Host "  2. Full - Reset entire repo to specific commit" -ForegroundColor Yellow
    Write-Host "  3. Abort - Cancel rollback" -ForegroundColor Red
    Write-Host ""
    
    $choice = Read-Host "Select (1-3)"
    
    switch ($choice) {
        "1" { Rollback-Quick }
        "2" {
            $hash = Read-Host "Enter commit hash to rollback to"
            Rollback-Full -CommitHash $hash
        }
        "3" {
            Write-Host "❌ Rollback aborted" -ForegroundColor Red
        }
        default {
            Write-Host "❌ Invalid selection" -ForegroundColor Red
        }
    }
}

# Main execution
switch ($Mode) {
    "quick" { Rollback-Quick }
    "full" { Rollback-Full -CommitHash $CommitHash }
    "interactive" { Rollback-Interactive }
}

Write-Host ""
Write-Host "For detailed rollback information, see MIGRATION_VALIDATION.md" -ForegroundColor Gray
