import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt
# from pandas.plotting import parallel_coordinates



filename = 'heart.csv'
data = pd.read_csv(filename)

# Compute the correlation matrix
correlation_matrix = data.corr()

# Set up the matplotlib figure
plt.figure(figsize=(12, 8))

# Create the heatmap
sns.heatmap(correlation_matrix, annot=True, fmt=".2f", cmap="coolwarm", cbar=True, square=True, linewidths=0.5)

# Add title
plt.title("Heatmap of Correlations - Heart Disease Dataset")

# Display the heatmap
plt.tight_layout()
plt.show()
