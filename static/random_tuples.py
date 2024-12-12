import pandas as pd

def select_random_rows(input_file, output_file=None, percentage=0.05):

    df = pd.read_csv(input_file)
    
    num_rows = len(df)
    num_select = int(num_rows * percentage)
    
    random_rows = df.sample(n=num_select, random_state=42)  # random_state for reproducibility
    

    # print(random_rows)
    
    if output_file:
        random_rows.to_csv(output_file, index=False)
        print(f"Selected rows saved to {output_file}")

# Example usage
input_file = 'clean_melb_data.csv'  # Replace with your CSV file path
output_file = 'small_housing.csv'  # Replace with your desired output file path

select_random_rows(input_file, output_file)
