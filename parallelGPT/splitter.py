import random
import argparse
import re 

def chunks(lst, n, out):
    train = int(len(lst)/n)
    new_list = lst
    """Yield successive n-sized chunks from lst."""
    for i in range(0, n):
        name =  out+'train'+str(i+1)+'.txt'
        with open(name, "w") as text_file:
            train_data = new_list[:train]
            train_str='.'.join(train_data)
            text_file.write(train_str)
            del new_list[:train]

def splitvalid(test, out):
    train_int = int(len(test)*0.93)
    val_int = -int(len(test)*0.07)
    print(train_int)
    print(val_int)
    train_data = test[:train_int]
    #del test[:train_int]
    test_data = test[val_int:]
    train_str='.'.join(train_data)
    test_str='.'.join(test_data)
    nametrain =  out+'train.txt'
    namevalid =  out+'valid.txt'
    with open(nametrain, "w") as text_file:
        text_file.write(train_str)

    with open(namevalid, "w") as valid_file:
        valid_file.write(test_str)
    return train_data

def main():
    parser = argparse.ArgumentParser()
    # Required parameters
    parser.add_argument(
        "--train_data_file", default=None, type=str, required=True, help="The input training data file (a text file)."
    )
    parser.add_argument(
        "--output_dir",
        type=str,
        required=True,
        help="The output directory where the model predictions and checkpoints will be written.",
    )
    parser.add_argument("--num_worker", type=int, default=-1, help="number of worker")
    args = parser.parse_args()
    test = []
    with open(args.train_data_file, "r") as f:
        data = f.read()
        test = re.split(r' *[\.\?!][\'"\)\]]* *', data)
        #test = data.split(' . ')

    train_data = splitvalid(test, args.output_dir)
    chunks(train_data,args.num_worker, args.output_dir)

if __name__ == "__main__":
    main()
