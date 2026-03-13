// Configuration management

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub core: CoreConfig,
    pub memory: MemoryConfig,
    pub recall: RecallConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoreConfig {
    pub version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data_dir: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryConfig {
    #[serde(default = "default_max_transactions")]
    pub max_transactions: usize,
    #[serde(default = "default_prune_days")]
    pub prune_after_days: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecallConfig {
    #[serde(default = "default_limit")]
    pub default_limit: usize,
    #[serde(default = "default_min_score")]
    pub min_score: f64,
}

fn default_max_transactions() -> usize { 100000 }
fn default_prune_days() -> u64 { 365 }
fn default_limit() -> usize { 10 }
fn default_min_score() -> f64 { 0.3 }

impl Default for Config {
    fn default() -> Self {
        Self {
            core: CoreConfig {
                version: "0.8.0".into(),
                data_dir: None,
            },
            memory: MemoryConfig {
                max_transactions: default_max_transactions(),
                prune_after_days: default_prune_days(),
            },
            recall: RecallConfig {
                default_limit: default_limit(),
                min_score: default_min_score(),
            },
        }
    }
}

impl Config {
    /// Load config from ~/.argus/config.toml
    pub fn load() -> Result<Self> {
        let home = std::env::home_dir().ok_or_else(|| anyhow::anyhow!("Cannot determine home directory"))?;
        let config_path = home.join(".argus").join("config.toml");

        if !config_path.exists() {
            return Ok(Self::default());
        }

        let content = fs::read_to_string(&config_path)?;
        let config: Self = toml::from_str(&content)?;
        Ok(config)
    }

    /// Save config to ~/.argus/config.toml
    pub fn save(&self) -> Result<()> {
        let home = std::env::home_dir().ok_or_else(|| anyhow::anyhow!("Cannot determine home directory"))?;
        let config_path = home.join(".argus").join("config.toml");

        let content = toml::to_string_pretty(self)?;
        fs::write(&config_path, content)?;
        Ok(())
    }
}
