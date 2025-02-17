import pandas as pd
import numpy as np
from sklearn.preprocessing import LabelEncoder
import seaborn as sns
import matplotlib.pyplot as plt

def clean_and_convert_to_numeric(df):
    """
    Cleans the DataFrame by converting all string or object columns to numeric.
    For categorical strings, Label Encoding is applied.
    For numeric-like strings, coercion is used.
    """
    for column in df.columns:
        if df[column].dtype == 'object':  # Check if column is object type (strings)
            try:
                # Attempt to convert strings to numbers directly
                df[column] = pd.to_numeric(df[column], errors='coerce')
            except ValueError:
                # If not possible, apply label encoding for categorical values
                le = LabelEncoder()
                df[column] = le.fit_transform(df[column].astype(str))
    return df

def get_sorted_correlations(df):
    """
    Calculates and sorts the correlations between all column pairs in descending order.
    
    Parameters:
    - df: pandas DataFrame
    
    Returns:
    - A DataFrame containing column pairs and their correlations, sorted by correlation value.
    """
    # Calculate correlation matrix
    corr_matrix = df.corr()

    # Extract upper triangle of the correlation matrix without diagonal
    corr_pairs = (
        corr_matrix.where(~corr_matrix.isna())
        .where(~np.tril(np.ones(corr_matrix.shape)).astype(bool))
        .stack()
        .reset_index()
    )
    corr_pairs.columns = ['Column 1', 'Column 2', 'Correlation']

    # Sort correlations in descending order
    sorted_corr = corr_pairs.sort_values(by='Correlation', ascending=False)
    return corr_matrix, sorted_corr

def visualize_correlation_matrix(corr_matrix):
    """
    Visualizes the correlation matrix as a heatmap.
    
    Parameters:
    - corr_matrix: pandas DataFrame (correlation matrix)
    """
    plt.figure(figsize=(10, 8))
    sns.heatmap(corr_matrix, annot=True, fmt=".2f", cmap="coolwarm", linewidths=0.5)
    plt.title("Correlation Matrix Heatmap")
    plt.show()

# Example dataset
data = pd.read_csv("clean_heart_disease.csv")

# Create DataFrame
df = pd.DataFrame(data)
print("Original DataFrame:")
print(df)

# Step 1: Clean up and convert all columns to numeric
cleaned_df = clean_and_convert_to_numeric(df)
print("\nCleaned DataFrame (All Numeric):")
print(cleaned_df)

# Step 2: Get the correlation matrix and sorted column pairs
correlation_matrix, sorted_correlations = get_sorted_correlations(cleaned_df)

# Step 3: Display the correlation matrix
print("\nCorrelation Matrix:")
print(correlation_matrix)

# Step 4: Display sorted correlations
print("\nSorted Correlations Between Column Pairs:")
print(sorted_correlations)

# Step 5: Visualize the correlation matrix
visualize_correlation_matrix(correlation_matrix)