# AI Moderation Analysis Scripts

This directory contains temporary analysis scripts to help optimize your Discord bot's AI moderation system by analyzing patterns in accepted vs ignored reports.

## Overview

Your staff is marking ~80% of AI moderation reports as ignored/invalid, which indicates the system needs tuning. These scripts analyze your historical moderation data to identify patterns and suggest optimal confidence thresholds.

## Scripts

### 1. `analyze-reports.ts` - Basic Analysis

- **Purpose**: Overall statistics and basic pattern analysis
- **Output**: `analysis-results.json`
- **What it does**:
  - Total report counts by status
  - Category breakdown (accepted vs ignored)
  - Confidence score ranges
  - Common words in false positives
  - Basic recommendations

### 2. `optimize-thresholds.ts` - Threshold Optimization

- **Purpose**: Calculate optimal confidence thresholds for each category
- **Output**: `threshold-optimization-results.json`
- **What it does**:
  - Tests different threshold values (0.1 to 0.9)
  - Calculates false positive reduction for each category
  - Provides specific threshold recommendations
  - Simulates impact of changes

### 3. `pattern-analysis.ts` - Deep Pattern Analysis

- **Purpose**: Advanced pattern detection in user behavior, timing, and content
- **Output**: `pattern-analysis-results.json`
- **What it does**:
  - Message content patterns (length, special characters)
  - User behavior analysis (repeat offenders, false positive prone users)
  - Temporal patterns (time of day, day of week trends)
  - Channel-specific patterns
  - Advanced recommendations

### 4. `run-all.ts` - Complete Analysis Suite

- **Purpose**: Runs all scripts in sequence and generates summary
- **Output**: `moderation-analysis-summary.json`
- **What it does**:
  - Executes all analysis scripts
  - Combines results into comprehensive report
  - Provides next steps and implementation guidance

## Usage

### Prerequisites

1. Ensure your bot's `.env` file contains `MONGODB_URI`
2. Have Bun installed on your system

### Installation

```powershell
# Navigate to the scripts directory
cd scripts/moderation-analysis

# Install dependencies
bun install
```

### Running Individual Scripts

```powershell
# Basic analysis
bun run analyze

# Threshold optimization
bun run optimize

# Pattern analysis
bun run patterns
```

### Running Complete Analysis

```powershell
# Run all scripts in sequence
bun run all

# Or use the runner script directly
bun run run-all.ts
```

## Output Files

All output files are saved in the same directory as the scripts:

- `analysis-results.json` - Basic analysis results
- `threshold-optimization-results.json` - Threshold recommendations
- `pattern-analysis-results.json` - Pattern analysis findings
- `moderation-analysis-summary.json` - Combined summary report

## Understanding the Results

### False Positive Rate

- **Current Rate**: Percentage of reports marked as "ignored"
- **Target**: Aim for <30% false positive rate
- **Impact**: Each 10% reduction in false positives significantly reduces staff workload

### Confidence Thresholds

- **Current**: Usually around 0.5 (50% confidence)
- **Recommended**: Category-specific thresholds based on historical accuracy
- **Implementation**: Update your moderation config with suggested values

### Categories to Focus On

Scripts will identify which categories have the highest false positive rates and would benefit most from threshold adjustments.

## Implementation Guidelines

### Phase 1: High-Impact Changes

1. Implement threshold changes for categories with >20% false positive reduction potential
2. Start with conservative adjustments (+0.1 to current thresholds)
3. Monitor results for 1 week

### Phase 2: Fine-Tuning

1. Apply moderate improvements (5-20% reduction)
2. Consider channel-specific or time-based thresholds
3. Implement user allowlists for consistent false positive users

### Phase 3: Advanced Optimizations

1. Content preprocessing (handle special characters, message length)
2. Contextual thresholds based on patterns identified
3. A/B testing for further refinements

## Sample Configuration Code

The optimization script will generate ready-to-use configuration code like:

```typescript
const optimizedThresholds = {
  harassment: 0.65, // was 0.500, reduces FP by 25.3%
  hate: 0.575, // was 0.500, reduces FP by 18.7%
  sexual: 0.7, // was 0.500, reduces FP by 31.2%
  // ... other categories
};
```

## Monitoring After Changes

After implementing threshold changes:

1. **Track Metrics**:

   - False positive rate (target: <30%)
   - True positive rate (maintain >70% of current detections)
   - Staff workload reduction

2. **Review Period**: Monitor for 2-4 weeks before further adjustments

3. **Feedback Loop**: Re-run these scripts monthly to identify new patterns

## Troubleshooting

### Common Issues

**"Cannot find module 'mongoose'"**

- Run `bun install` in the scripts directory

**"MONGODB_URI not found"**

- Ensure your bot's `.env` file is properly configured
- The scripts automatically load environment variables from `../../bot/.env`

**"No reports found"**

- Verify your database connection
- Check that you have ModerationHit documents with status "accepted" or "ignored"

**Script hangs or takes too long**

- Large datasets may take several minutes to process
- Consider adding database indexes for better performance

### Performance Tips

- Scripts are optimized for datasets up to 100k reports
- For larger datasets, consider adding pagination or time-based filtering
- MongoDB indexes on `status`, `createdAt`, and `flaggedCategories` improve performance

## Security Notes

- These scripts only READ from your database, no modifications are made
- All output files contain sanitized data (no personal information)
- User IDs in output are for internal analysis only

## Cleanup

After analysis is complete and changes are implemented:

```powershell
# Remove the analysis scripts directory
cd ../..
rm -rf scripts/moderation-analysis
```

The scripts are designed to be temporary tools for one-time optimization.
